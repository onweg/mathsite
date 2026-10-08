"""Логин/проверка токена учителя (администратора)."""

from uuid import UUID

from app.core.errors import NotAuthenticated
from app.core.security import create_access_token, decode_access_token, verify_password
from app.domain.auth.types import User
from app.infrastructure.repositories.users_repo import UsersRepository


class AuthService:
    def __init__(self, users: UsersRepository):
        self._users = users

    async def login(self, email: str, password: str) -> tuple[User, str]:
        pair = await self._users.get_by_email(email)
        if not pair:
            raise NotAuthenticated("неверный email или пароль")
        user, pw_hash = pair
        if not verify_password(password, pw_hash):
            raise NotAuthenticated("неверный email или пароль")
        token = create_access_token(user.id, user.role)
        return user, token

    async def user_from_token(self, token: str) -> User:
        payload = decode_access_token(token)
        try:
            user_id = UUID(payload["sub"])
        except (KeyError, ValueError) as e:
            raise NotAuthenticated("invalid token payload") from e
        user = await self._users.get_by_id(user_id)
        if not user:
            raise NotAuthenticated("user not found")
        return user
