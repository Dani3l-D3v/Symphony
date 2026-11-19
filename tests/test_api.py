import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import main


class AdminApiTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.db_path = Path(self.directory.name) / "test.sqlite3"
        self.engine = create_engine(
            f"sqlite:///{self.db_path}",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        self.session_factory = sessionmaker(bind=self.engine, autoflush=False, expire_on_commit=False)
        self.patches = [
            patch.object(main, "engine", self.engine),
            patch.object(main, "SessionLocal", self.session_factory),
            patch.dict(os.environ, {"ADMIN_EMAIL": "admin@example.com", "ADMIN_PASSWORD": "A-strong-test-password-123"}),
        ]
        for item in self.patches:
            item.start()
        self.client = TestClient(main.app)
        self.client.__enter__()
        response =         response = self.client.post("/api/auth/login", json={
            "email": "admin@example.com", "password": "A-strong-test-password-123",
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn("httponly", response.headers["set-cookie"].lower())

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.engine.dispose()
        for item in reversed(self.patches):
            item.stop()
        self.directory.cleanup()

    def test_authentication_and_logout(self):
        self.assertEqual(self.client.get("/api/dashboard").status_code, 200)
        self.assertIsNotNone(self.client.cookies.get(main.COOKIE_NAME))
        self.client.post("/api/auth/logout")
        self.assertEqual(self.client.get("/api/auth/me").status_code, 200)
        self.assertIsNone(self.client.get("/api/auth/me").json())

    def test_users_create_update_and_last_admin_protection(self):
        response = self.client.post("/api/users", json={
            "name": "Equipe Um", "email": "equipe@example.com",
            "password": "Another-strong-password-123", "role": "agent",
        })
        self.assertEqual(response.status_code, 201)
        user = response.json()
        self.assertNotIn("password_hash", user)
        self.assertEqual(self.client.patch(f"/api/users/{user['id']}", json={"active": False}).status_code, 200)
        admin_id = self.client.get("/api/auth/me").json()["id"]
        response = self.client.patch(f"/api/users/{admin_id}", json={"active": False})
        self.assertEqual(response.status_code, 409)

    def test_request_lifecycle_and_search_data(self):
        services = self.client.get("/api/services").json()
        created = self.client.post("/api/requests", json={
            "customer_name": "Cliente de teste", "customer_email": "client@example.com",
            "service_id": services[0]["id"], "description": "Acesso indisponível para o time.",
            "priority": "high",
        })
        self.assertEqual(created.status_code, 201)
        item = created.json()
        self.assertTrue(item["code"].startswith("SP-"))
        self.assertEqual(item["service_name"], services[0]["name"])
        updated = self.client.patch(f"/api/requests/{item['id']}", json={"status": "in_progress"})
        self.assertEqual(updated.json()["status"], "in_progress")
        self.assertEqual(self.client.delete(f"/api/requests/{item['id']}").status_code, 204)
        self.assertEqual(self.client.delete(f"/api/requests/{item['id']}").status_code, 404)

    def test_service_status_and_dashboard_metrics(self):
        service = self.client.get("/api/services").json()[0]
        updated = self.client.patch(f"/api/services/{service['id']}", json={"status": "degraded"})
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["status"], "degraded")
        dashboard = self.client.get("/api/dashboard").json()
        self.assertGreaterEqual(dashboard["total_requests"], 1)
        self.assertEqual(len(dashboard["weekly_requests"]), 7)
        self.assertEqual(dashboard["total_services"], len(dashboard["services"]))

    def test_invalid_credentials_and_input(self):
        self.client.post("/api/auth/logout")
        self.assertEqual(self.client.post("/api/auth/login", json={
            "email": "admin@example.com", "password": "wrong",
        }).status_code, 401)
        self.assertEqual(self.client.get("/api/users").status_code, 401)


if __name__ == "__main__":
    unittest.main()
