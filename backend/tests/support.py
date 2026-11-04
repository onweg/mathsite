"""Isolated test settings, database lifecycle and synthetic data."""
import os
import re
import tempfile
from urllib.parse import unquote, urlparse

EMAIL = 'teacher@example.test'
PASSWORD = 'test-password-123'


def database_dsn():
    dsn = os.environ.get('TEST_DATABASE_URL', '')
    parsed = urlparse(dsn)
    if parsed.scheme != 'postgresql' or not re.fullmatch(r'mathsite_test(?:_[a-z0-9]+)?', parsed.path[1:]):
        raise RuntimeError('TEST_DATABASE_URL must explicitly name a dedicated mathsite_test[_suffix] database')
    return dsn


def configure_environment():
    # Explicit overrides prevent local .env credentials or uploads entering tests.
    dsn = os.environ.get('TEST_DATABASE_URL', 'postgresql://postgres:postgres@127.0.0.1:5544/mathsite_test')
    parsed = urlparse(dsn)
    os.environ.update({
        'YC_FOLDER_ID': 'test-only', 'YC_API_KEY': 'test-only', 'YC_API_KEY_ID': '',
        'JWT_SECRET': 'test-only-signing-key-not-for-production-123456', 'APP_ENV': 'test',
        'POSTGRES_HOST': parsed.hostname or '127.0.0.1', 'POSTGRES_PORT': str(parsed.port or 5432),
        'POSTGRES_DB': parsed.path[1:], 'POSTGRES_USER': unquote(parsed.username or 'postgres'),
        'POSTGRES_PASSWORD': unquote(parsed.password or ''),
        'UPLOAD_DIR': os.environ.get('TEST_UPLOAD_DIR') or tempfile.mkdtemp(prefix='mathsite-test-uploads-'),
    })
    if os.environ.get('TEST_DATABASE_URL'):
        database_dsn()
        os.environ['ANALYTICS_TEST_DSN'] = dsn


def reset_database():
    """Destructive only inside an explicitly named, dedicated test database."""
    import psycopg
    from psycopg import sql
    from app.core.security import hash_password
    with psycopg.connect(database_dsn()) as conn:
        tables = conn.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'alembic_version'").fetchall()
        if tables:
            conn.execute(sql.SQL('TRUNCATE {} RESTART IDENTITY CASCADE').format(
                sql.SQL(', ').join(sql.Identifier('public', t[0]) for t in tables)))
        conn.execute('INSERT INTO users (email,password_hash,name) VALUES (%s,%s,%s)',
                     (EMAIL, hash_password(PASSWORD), 'Тестовый учитель'))


def sample_pdf():
    """A real, tiny text PDF, generated in memory (no private textbook fixtures)."""
    import io
    from pypdf import PdfWriter
    from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
    writer = PdfWriter()
    page = writer.add_blank_page(width=400, height=400)
    font = DictionaryObject({NameObject('/Type'): NameObject('/Font'), NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Helvetica')})
    page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'): writer._add_object(font)})})
    stream = DecodedStreamObject()
    stream.set_data(b'BT /F1 12 Tf 30 350 Td (Algebra: a linear equation x + 1 = 3 has the solution x = 2. Subtract one from both sides to solve the equation and check the answer.) Tj ET')
    page[NameObject('/Contents')] = writer._add_object(stream)
    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()
