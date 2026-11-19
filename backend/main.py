import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

import jwt
from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi import Request
from jwt import InvalidTokenError
from pwdlib import PasswordHash
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, create_engine, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql+psycopg://symphony:symphony@localhost:5432/symphony"
)
JWT_SECRET = os.getenv("JWT_SECRET", "local-development-secret-change-before-deploy")
JWT_ALGORITHM = "HS256"
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
COOKIE_NAME = "symphony_session"
SESSION_HOURS = 12
password_hasher = PasswordHash.recommended()
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="agent")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Service(Base):
    __tablename__ = "services"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    description: Mapped[str] = mapped_column(String(250), default="")
    status: Mapped[str] = mapped_column(String(20), default="operational")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    requests: Mapped[list["ServiceRequest"]] = relationship(back_populates="service")


class ServiceRequest(Base):
    __tablename__ = "service_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    customer_name: Mapped[str] = mapped_column(String(100))
    customer_email: Mapped[str] = mapped_column(String(254))
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id", ondelete="RESTRICT"))
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="new")
    priority: Mapped[str] = mapped_column(String(20), default="normal")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    service: Mapped[Service] = relationship(back_populates="requests", lazy="joined")

    @property
    def service_name(self) -> str:
        return self.service.name


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def seed_database() -> None:
    db = SessionLocal()
    try:
        admin_email = os.getenv("ADMIN_EMAIL", "admin@example.com").strip().lower()
        if not db.scalar(select(User).where(User.email == admin_email)):
            db.add(User(
                name=os.getenv("ADMIN_NAME", "Admin Symphony"),
                email=admin_email,
                password_hash=password_hasher.hash(os.getenv("ADMIN_PASSWORD", "DevOnly-ChangeThis123!")),
                role="admin",
                active=True,
            ))
        if not db.scalar(select(Service.id).limit(1)):
            services = [
                Service(name="Suporte técnico", description="Atendimento e suporte à equipe", status="operational"),
                Service(name="Infraestrutura", description="Servidores e infraestrutura de TI", status="operational"),
                Service(name="Financeiro", description="Pagamentos e solicitações financeiras", status="maintenance"),
                Service(name="Onboarding", description="Integração de novos clientes", status="operational"),
            ]
            db.add_all(services)
            db.flush()
            now = datetime.now(timezone.utc)
            samples = [
                ("Marina Costa", "marina@example.com", services[0], "Acesso ao sistema expirou e não consigo redefinir a senha.", "new", "high", 0),
                ("Thomas Smith", "thomas@example.com", services[1], "Gostaria de solicitar a configuração de um novo ambiente.", "in_progress", "normal", 1),
                ("Stella Caldwell", "stella@example.com", services[3], "Agendar onboarding para a equipe de operações.", "completed", "low", 2),
                ("Ernest Waverly", "ernest@example.com", services[2], "Verificar o status da fatura do último mês.", "in_progress", "normal", 3),
                ("Eloise Cobain", "eloise@example.com", services[0], "Configuração de acesso para uma nova integrante.", "new", "normal", 4),
            ]
            for name, email, service, description, request_status, priority, days in samples:
                created = now - timedelta(days=days, hours=days * 2)
                db.add(ServiceRequest(
                    code=f"SP-{secrets.token_hex(3).upper()}",
                    customer_name=name,
                    customer_email=email,
                    service=service,
                    description=description,
                    status=request_status,
                    priority=priority,
                    created_at=created,
                    updated_at=created,
                ))
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    seed_database()
    yield


app = FastAPI(title="Symphony Admin API", version="1.0.0", lifespan=lifespan)


class LoginInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserInput(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    role: Literal["admin", "agent"] = "agent"
    active: bool = True

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        return value.strip()


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=10, max_length=128)
    role: Literal["admin", "agent"] | None = None
    active: bool | None = None


class UserOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    email: EmailStr
    role: str
    active: bool
    created_at: datetime


class ServiceInput(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str = Field(default="", max_length=250)
    status: Literal["operational", "maintenance", "degraded"] = "operational"


class ServiceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=250)
    status: Literal["operational", "maintenance", "degraded"] | None = None


class ServiceOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str
    status: str
    updated_at: datetime


class RequestInput(BaseModel):
    customer_name: str = Field(min_length=2, max_length=100)
    customer_email: EmailStr
    service_id: int = Field(gt=0)
    description: str = Field(min_length=5, max_length=2000)
    priority: Literal["low", "normal", "high"] = "normal"


class RequestUpdate(BaseModel):
    status: Literal["new", "in_progress", "completed", "cancelled"] | None = None
    priority: Literal["low", "normal", "high"] | None = None
    service_id: int | None = Field(default=None, gt=0)


class RequestOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    customer_name: str
    customer_email: EmailStr
    service_id: int
    service_name: str
    description: str
    status: str
    priority: str
    created_at: datetime
    updated_at: datetime


def serialize_user(user: User) -> UserOutput:
    return UserOutput.model_validate(user)


def authenticated_user(db: Session, request: Request) -> User:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Faça login para continuar.")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = int(payload["sub"])
    except (InvalidTokenError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Sua sessão expirou. Entre novamente.") from exc
    user = db.get(User, user_id)
    if not user or not user.active:
        raise HTTPException(status_code=401, detail="Sua conta está indisponível.")
    return user


def get_current_user(db: Annotated[Session, Depends(get_db)], request: Request) -> User:
    return authenticated_user(db, request)


def require_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Somente administradores podem gerenciar usuários.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(require_admin)]
Database = Annotated[Session, Depends(get_db)]


@app.get("/api/health")
def health(db: Database) -> dict[str, str]:
    db.execute(select(1))
    return {"status": "ok"}


@app.post("/api/auth/login", response_model=UserOutput)
def login(data: LoginInput, response: Response, db: Database) -> UserOutput:
    user = db.scalar(select(User).where(User.email == str(data.email).lower()))
    if not user or not user.active or not password_hasher.verify(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")
    token = jwt.encode(
        {"sub": str(user.id), "exp": datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS)},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )
    response.set_cookie(
        COOKIE_NAME, token, httponly=True, secure=COOKIE_SECURE, samesite="lax",
        max_age=SESSION_HOURS * 60 * 60, path="/",
    )
    return serialize_user(user)


@app.post("/api/auth/logout", status_code=204)
def logout(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/", httponly=True, secure=COOKIE_SECURE, samesite="lax")


@app.get("/api/auth/me", response_model=UserOutput | None)
def me(db: Database, request: Request) -> UserOutput | None:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = db.get(User, int(payload["sub"]))
    except (InvalidTokenError, KeyError, TypeError, ValueError):
        return None
    return serialize_user(user) if user and user.active else None


@app.get("/api/users", response_model=list[UserOutput])
def list_users(_: AdminUser, db: Database) -> list[UserOutput]:
    return [serialize_user(user) for user in db.scalars(select(User).order_by(User.created_at.desc()))]


@app.post("/api/users", response_model=UserOutput, status_code=201)
def create_user(data: UserInput, _: AdminUser, db: Database) -> UserOutput:
    user = User(
        name=data.name.strip(), email=str(data.email).lower(),
        password_hash=password_hasher.hash(data.password), role=data.role, active=data.active,
    )
    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Já existe uma conta com este e-mail.") from exc
    return serialize_user(user)


@app.patch("/api/users/{user_id}", response_model=UserOutput)
def update_user(user_id: int, data: UserUpdate, actor: AdminUser, db: Database) -> UserOutput:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    changes = data.model_dump(exclude_unset=True)
    if "active" in changes and changes["active"] is False and user.role == "admin":
        active_admins = db.scalar(select(func.count(User.id)).where(User.role == "admin", User.active.is_(True))) or 0
        if active_admins <= 1:
            raise HTTPException(status_code=409, detail="Mantenha pelo menos um administrador ativo.")
    if actor.id == user.id and (changes.get("active") is False or changes.get("role") == "agent"):
        raise HTTPException(status_code=409, detail="Você não pode remover seu próprio acesso administrativo.")
    if changes.get("email") is not None:
        changes["email"] = str(changes["email"]).lower()
    if changes.get("name") is not None:
        changes["name"] = changes["name"].strip()
    if changes.get("password") is not None:
        changes["password_hash"] = password_hasher.hash(changes.pop("password"))
    for key, value in changes.items():
        setattr(user, key, value)
    try:
        db.commit()
        db.refresh(user)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Já existe uma conta com este e-mail.") from exc
    return serialize_user(user)


@app.delete("/api/users/{user_id}", status_code=204)
def delete_user(user_id: int, actor: AdminUser, db: Database) -> None:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    if user.id == actor.id:
        raise HTTPException(status_code=409, detail="Você não pode excluir sua própria conta.")
    if user.role == "admin" and user.active:
        active_admins = db.scalar(select(func.count(User.id)).where(User.role == "admin", User.active.is_(True))) or 0
        if active_admins <= 1:
            raise HTTPException(status_code=409, detail="Mantenha pelo menos um administrador ativo.")
    db.delete(user)
    db.commit()


@app.get("/api/services", response_model=list[ServiceOutput])
def list_services(_: CurrentUser, db: Database) -> list[ServiceOutput]:
    return [ServiceOutput.model_validate(service) for service in db.scalars(select(Service).order_by(Service.name))]


@app.post("/api/services", response_model=ServiceOutput, status_code=201)
def create_service(data: ServiceInput, _: AdminUser, db: Database) -> ServiceOutput:
    service = Service(name=data.name.strip(), description=data.description.strip(), status=data.status)
    db.add(service)
    try:
        db.commit()
        db.refresh(service)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Já existe um serviço com este nome.") from exc
    return ServiceOutput.model_validate(service)


@app.patch("/api/services/{service_id}", response_model=ServiceOutput)
def update_service(service_id: int, data: ServiceUpdate, _: AdminUser, db: Database) -> ServiceOutput:
    service = db.get(Service, service_id)
    if not service:
        raise HTTPException(status_code=404, detail="Serviço não encontrado.")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(service, key, value.strip() if isinstance(value, str) else value)
    try:
        db.commit()
        db.refresh(service)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Já existe um serviço com este nome.") from exc
    return ServiceOutput.model_validate(service)


@app.get("/api/requests", response_model=list[RequestOutput])
def list_requests(_: CurrentUser, db: Database) -> list[RequestOutput]:
    requests = db.scalars(select(ServiceRequest).order_by(ServiceRequest.created_at.desc())).unique()
    return [RequestOutput.model_validate(item) for item in requests]


@app.post("/api/requests", response_model=RequestOutput, status_code=201)
def create_request(data: RequestInput, _: CurrentUser, db: Database) -> RequestOutput:
    if not db.get(Service, data.service_id):
        raise HTTPException(status_code=404, detail="Serviço não encontrado.")
    item = ServiceRequest(
        code=f"SP-{secrets.token_hex(3).upper()}",
        customer_name=data.customer_name.strip(),
        customer_email=str(data.customer_email).lower(),
        service_id=data.service_id,
        description=data.description.strip(),
        priority=data.priority,
        status="new",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return RequestOutput.model_validate(item)


@app.patch("/api/requests/{request_id}", response_model=RequestOutput)
def update_request(request_id: int, data: RequestUpdate, _: CurrentUser, db: Database) -> RequestOutput:
    item = db.get(ServiceRequest, request_id)
    if not item:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada.")
    changes = data.model_dump(exclude_unset=True)
    if "service_id" in changes and not db.get(Service, changes["service_id"]):
        raise HTTPException(status_code=404, detail="Serviço não encontrado.")
    for key, value in changes.items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return RequestOutput.model_validate(item)


@app.delete("/api/requests/{request_id}", status_code=204)
def delete_request(request_id: int, _: CurrentUser, db: Database) -> None:
    item = db.get(ServiceRequest, request_id)
    if not item:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada.")
    db.delete(item)
    db.commit()


@app.get("/api/dashboard")
def dashboard(_: CurrentUser, db: Database) -> dict:
    now = datetime.now(timezone.utc)
    week_start = now - timedelta(days=6)
    month_start = now - timedelta(days=30)
    requests = list(db.scalars(select(ServiceRequest).order_by(ServiceRequest.created_at)))
    services = list(db.scalars(select(Service).order_by(Service.name)))
    users_total = db.scalar(select(func.count(User.id)).where(User.active.is_(True))) or 0
    counts = {"new": 0, "in_progress": 0, "completed": 0, "cancelled": 0}
    weekly = { (week_start.date() + timedelta(days=offset)).isoformat(): 0 for offset in range(7) }
    for item in requests:
        counts[item.status] = counts.get(item.status, 0) + 1
        created = item.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        day = created.date().isoformat()
        if day in weekly:
            weekly[day] += 1
    recent = [RequestOutput.model_validate(item) for item in reversed(requests[-5:])]
    completed_month = sum(
        1 for item in requests
        if item.status == "completed" and (
            item.updated_at.replace(tzinfo=timezone.utc) if item.updated_at.tzinfo is None else item.updated_at
        ) >= month_start
    )
    return {
        "total_requests": len(requests),
        "open_requests": counts["new"] + counts["in_progress"],
        "active_users": users_total,
        "operational_services": sum(1 for service in services if service.status == "operational"),
        "total_services": len(services),
        "completed_this_month": completed_month,
        "requests_by_status": counts,
        "weekly_requests": [{"date": day, "count": count} for day, count in weekly.items()],
        "services": [ServiceOutput.model_validate(service) for service in services],
        "recent_requests": recent,
    }
