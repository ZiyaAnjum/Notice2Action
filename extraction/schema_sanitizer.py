"""Gemini OpenAPI Schema Sanitizer.

Converts standard JSON Schemas into Gemini OpenAPI-compatible Schema structures.
Google Gemini's generateContent API maps response_schema to the Protobuf Schema
definition (google.ai.generativelanguage.v1beta.Schema), which:
1. Requires `type` to be a single enum value (STRING, NUMBER, INTEGER, BOOLEAN, ARRAY, OBJECT),
   disallowing JSON Schema union lists such as ["string", "null"].
2. Expresses nullability via the boolean field `nullable: true`.
3. Disallows JSON Schema draft constructs such as $schema, $id, $ref, $defs, definitions,
   additionalProperties, title, default, pattern, patternProperties, and unsupported formats.
4. Does not support anyOf/oneOf protobuf unions; nullable branches must be flattened.
"""

from __future__ import annotations

import copy
from typing import Any

# Formats officially supported by Google Gemini Schema Proto
SUPPORTED_GEMINI_FORMATS = {
    "date-time",
    "enum",
    "int32",
    "int64",
    "float",
    "double",
    "byte",
}

# Keywords not supported in Gemini responseSchema protobuf
UNSUPPORTED_GEMINI_KEYWORDS = {
    "$schema",
    "$id",
    "$ref",
    "$defs",
    "definitions",
    "additionalProperties",
    "title",
    "default",
    "examples",
    "pattern",
    "patternProperties",
    "minProperties",
    "maxProperties",
    "minLength",
    "maxLength",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "minItems",
    "maxItems",
    "uniqueItems",
}


def sanitize_gemini_schema(schema: Any) -> Any:
    """Recursively convert a JSON Schema into a Gemini-compatible Schema dict.

    - Replaces list-valued types e.g. ["string", "null"] with "type": "string" and "nullable": True.
    - Flattens anyOf/oneOf containing a null branch into a single nullable type.
    - Strips keywords not recognized by Gemini's Protobuf Schema.
    - Operates on a deep copy without mutating the input schema.
    """
    if not isinstance(schema, dict):
        if isinstance(schema, list):
            return [sanitize_gemini_schema(item) for item in schema]
        return schema

    # Work on a deep copy so input schema is never modified
    s = copy.deepcopy(schema)

    # 1. Handle anyOf / oneOf (e.g. [{"type": "string"}, {"type": "null"}])
    for union_key in ("anyOf", "oneOf"):
        if union_key in s and isinstance(s[union_key], list):
            branches = s.pop(union_key)
            non_null_branches = [
                b for b in branches if isinstance(b, dict) and b.get("type") != "null"
            ]
            has_null = any(
                isinstance(b, dict) and b.get("type") == "null" for b in branches
            )
            if non_null_branches:
                # Merge the first non-null branch into our schema dict
                merged = sanitize_gemini_schema(non_null_branches[0])
                if isinstance(merged, dict):
                    s.update(merged)
            if has_null:
                s["nullable"] = True

    if "allOf" in s and isinstance(s["allOf"], list):
        branches = s.pop("allOf")
        for b in branches:
            if isinstance(b, dict):
                s.update(sanitize_gemini_schema(b))

    # 2. Handle list-valued type: e.g. ["string", "null"], ["integer", "null"]
    raw_type = s.get("type")
    if isinstance(raw_type, (list, tuple)):
        non_null = [t for t in raw_type if t != "null"]
        has_null = "null" in raw_type
        target_type = non_null[0] if non_null else "string"
        s["type"] = str(target_type).lower()
        if has_null:
            s["nullable"] = True
    elif isinstance(raw_type, str):
        if raw_type == "null":
            s["type"] = "string"
            s["nullable"] = True
        else:
            s["type"] = raw_type.lower()

    # 3. Handle unsupported format values
    if "format" in s:
        fmt = str(s["format"]).lower()
        if fmt not in SUPPORTED_GEMINI_FORMATS:
            del s["format"]
        else:
            s["format"] = fmt

    # 4. Remove all unsupported Gemini Schema keywords
    for keyword in UNSUPPORTED_GEMINI_KEYWORDS:
        s.pop(keyword, None)

    # 5. Recursively process properties
    if "properties" in s and isinstance(s["properties"], dict):
        s["properties"] = {
            k: sanitize_gemini_schema(v) for k, v in s["properties"].items()
        }
        # Ensure 'required' only includes properties that actually exist
        if "required" in s and isinstance(s["required"], list):
            s["required"] = [k for k in s["required"] if k in s["properties"]]

    # 6. Recursively process items
    if "items" in s:
        if isinstance(s["items"], dict):
            s["items"] = sanitize_gemini_schema(s["items"])
        elif isinstance(s["items"], list):
            s["items"] = [sanitize_gemini_schema(it) for it in s["items"]]

    return s
