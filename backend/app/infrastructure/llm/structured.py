"""Provider-facing JSON shape; domain models remain the validation authority.

Do not send Pydantic's internal references and validation keywords to constrained
decoders. Keep the original contract in the prompt and validate the response at
the caller, including bounds and cross-field rules.
"""
import json

from app.core.errors import LLMBadResponse
from app.domain.chat.types import Message


def portable_schema(schema: dict) -> dict:
    def visit(node, seen=()):
        if not isinstance(node, dict):
            return node
        if '$ref' in node:
            ref = node['$ref']
            if not isinstance(ref, str) or not ref.startswith('#/') or ref in seen:
                raise LLMBadResponse('Неподдерживаемая рекурсивная схема ответа')
            resolved = schema
            try:
                for key in ref[2:].split('/'):
                    resolved = resolved[key.replace('~1', '/').replace('~0', '~')]
            except (KeyError, TypeError) as exc:
                raise LLMBadResponse('Не удалось подготовить схему ответа') from exc
            return visit(resolved | {k: v for k, v in node.items() if k != '$ref'}, (*seen, ref))
        out = {key: node[key] for key in ('type', 'enum', 'required', 'description') if key in node}
        if 'properties' in node:
            out['properties'] = {key: visit(value, seen) for key, value in node['properties'].items()}
        if 'items' in node:
            out['items'] = visit(node['items'], seen)
        return out
    return visit(schema)


def messages_with_schema(messages: list[Message], schema: dict) -> list[Message]:
    instruction = ('\nВерни только JSON, без Markdown. Соблюдай эту JSON Schema, включая ограничения чисел, '
                   'длины строк и количества элементов:\n' + json.dumps(schema, ensure_ascii=False))
    if messages and messages[0].role == 'system':
        return [Message(role='system', text=messages[0].text + instruction), *messages[1:]]
    return [Message(role='system', text=instruction), *messages]
