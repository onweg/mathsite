from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import get_auth_service, get_current_admin
from app.domain.auth.types import User
from app.schemas.auth import LoginRequest, LoginResponse, UserOut
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_out(user: User) -> UserOut:
    return UserOut(id=str(user.id), email=user.email, name=user.name, role=user.role)


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    auth: Annotated[AuthService, Depends(get_auth_service)],
) -> LoginResponse:
    user, token = await auth.login(body.email, body.password)
    return LoginResponse(user=_user_out(user), access_token=token)


@router.get("/me", response_model=UserOut)
async def me(
    user: Annotated[User, Depends(get_current_admin)],
) -> UserOut:
    return _user_out(user)
