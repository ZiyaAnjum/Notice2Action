import json
from pathlib import Path
import jsonschema

schema_path = Path("schemas/notice_output.schema.json")
with open(schema_path, "r", encoding="utf-8") as f:
    old_schema = json.load(f)

# Build v2 definition
v2_def = {
    "type": "object",
    "description": "Notice Decision Card V2 schema format",
    "required": [
        "status",
        "warnings",
        "headline",
        "deadlines",
        "action_steps",
        "consequences",
        "summary_plain"
    ],
    "properties": {
        "status": {
            "type": "string",
            "enum": ["complete", "partial", "failed"]
        },
        "warnings": {
            "type": "array",
            "items": {"type": "string"}
        },
        "headline": {
            "type": "object",
            "required": [
                "one_line_summary",
                "notice_type",
                "source_organisation",
                "urgency"
            ],
            "properties": {
                "one_line_summary": {"type": "string"},
                "notice_type": {"type": "string"},
                "source_organisation": {"type": "string"},
                "amount_due": {
                    "type": ["object", "null"],
                    "required": ["amount", "currency"],
                    "properties": {
                        "amount": {"type": "number"},
                        "currency": {"type": "string"}
                    }
                },
                "primary_deadline_id": {
                    "type": ["string", "null"]
                },
                "urgency": {
                    "type": "string",
                    "enum": ["overdue", "urgent", "soon", "none"]
                }
            }
        },
        "deadlines": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "label", "kind", "date_type", "evidence"],
                "properties": {
                    "id": {"type": "string"},
                    "label": {"type": "string"},
                    "kind": {
                        "type": "string",
                        "enum": ["no_penalty_by", "due", "disconnection_risk", "other", "ambiguous"]
                    },
                    "date": {"type": ["string", "null"]},
                    "date_type": {
                        "type": "string",
                        "enum": ["exact", "estimated"]
                    },
                    "derived_from": {
                        "type": ["object", "null"],
                        "properties": {
                            "offset_days": {"type": "integer"},
                            "relative_to": {"type": "string"}
                        }
                    },
                    "evidence": {
                        "type": "object",
                        "required": ["page", "quote", "verified"],
                        "properties": {
                            "page": {"type": "integer", "minimum": 1},
                            "quote": {"type": "string"},
                            "verified": {"type": "boolean"},
                            "needs_verification": {"type": "boolean"}
                        }
                    }
                }
            }
        },
        "action_steps": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["order", "text", "evidence"],
                "properties": {
                    "order": {"type": "integer"},
                    "text": {"type": "string", "minLength": 1},
                    "evidence": {
                        "type": "object",
                        "required": ["page", "quote", "verified"],
                        "properties": {
                            "page": {"type": "integer", "minimum": 1},
                            "quote": {"type": "string"},
                            "verified": {"type": "boolean"},
                            "needs_verification": {"type": "boolean"}
                        }
                    }
                }
            }
        },
        "consequences": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["label", "value", "evidence"],
                "properties": {
                    "label": {"type": "string"},
                    "value": {"type": "string"},
                    "evidence": {
                        "type": "object",
                        "required": ["page", "quote", "verified"],
                        "properties": {
                            "page": {"type": "integer", "minimum": 1},
                            "quote": {"type": "string"},
                            "verified": {"type": "boolean"},
                            "needs_verification": {"type": "boolean"}
                        }
                    }
                }
            }
        },
        "required_documents": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["name", "evidence"],
                "properties": {
                    "name": {"type": "string"},
                    "evidence": {
                        "type": "object",
                        "required": ["page", "quote", "verified"],
                        "properties": {
                            "page": {"type": "integer", "minimum": 1},
                            "quote": {"type": "string"},
                            "verified": {"type": "boolean"}
                        }
                    }
                }
            }
        },
        "where_to_submit": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["channel", "evidence"],
                "properties": {
                    "channel": {"type": "string"},
                    "details": {"type": "string"},
                    "evidence": {
                        "type": "object",
                        "required": ["page", "quote", "verified"],
                        "properties": {
                            "page": {"type": "integer", "minimum": 1},
                            "quote": {"type": "string"},
                            "verified": {"type": "boolean"}
                        }
                    }
                }
            }
        },
        "conditions_that_apply": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["condition", "evidence"],
                "properties": {
                    "condition": {"type": "string"},
                    "evidence": {
                        "type": "object",
                        "required": ["page", "quote", "verified"],
                        "properties": {
                            "page": {"type": "integer", "minimum": 1},
                            "quote": {"type": "string"},
                            "verified": {"type": "boolean"}
                        }
                    }
                }
            }
        },
        "summary_plain": {"type": "string"},
        "raw_text_ref": {"type": "string"},
        "schema_version": {"type": "string"},
        "notice_id": {"type": "string"},
        "category": {"type": "string"}
    }
}

# Preserve v1 under NoticeOutputV1
v1_def = {
    "type": "object",
    "description": "Legacy Phase 1 Notice Output Schema",
    "required": old_schema.get("required", []),
    "properties": old_schema.get("properties", {}),
}

new_defs = dict(old_schema.get("$defs", {}))
new_defs["NoticeDecisionCardV2"] = v2_def
new_defs["NoticeOutputV1"] = v1_def

new_schema = {
    "$schema": old_schema.get("$schema", "https://json-schema.org/draft/2020-12/schema"),
    "$id": old_schema.get("$id", "https://notice2action.action4ai.internal/schemas/notice_output.schema.json"),
    "title": "NoticeOutputSchema",
    "version": "2.0",
    "description": old_schema.get("description", "Standardized schema contract for structured, evidence-linked extraction of official notices aligned with the Notice to Action PRD."),
    "oneOf": [
        {"$ref": "#/$defs/NoticeDecisionCardV2"},
        {"$ref": "#/$defs/NoticeOutputV1"}
    ],
    "$defs": new_defs
}

# Validate new schema
jsonschema.Draft202012Validator.check_schema(new_schema)
print("Schema is valid Draft 2020-12!")

# Write out
with open(schema_path, "w", encoding="utf-8") as f:
    json.dump(new_schema, f, indent=2)

print("Saved updated schema to", schema_path)

