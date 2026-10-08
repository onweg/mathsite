from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str


class LoginResponse(BaseModel):
    user: UserOut
    access_token: str
    token_type: str = "bearer"
