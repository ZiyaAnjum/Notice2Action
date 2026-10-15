# Product Requirements Document (PRD) - Notice to Action

**Team**: Action4AI  
**Phase**: MVP Starter Scaffold  
**Version**: 1.0  

---

## 1. Executive Summary

Official notices (scholarship circulars, bank KYC mandates, municipal utility notices, tax compliance orders, government schemes) are dense, jargon-laden PDFs. Citizens and students routinely miss critical deadlines, fail to assemble mandatory documents, or face financial penalties due to ambiguous language.

**Notice to Action** transforms unstructured official PDF notices into structured, verifiable, evidence-linked action plans featuring:
- Categorized action plans with countdown deadlines
- Required document checklists (distinguishing explicitly required vs optional)
- Uncertainty warnings (flagging conflicting dates, relative deadlines, or illegible sections)
- Direct quote verification ("See in Notice") linking every critical claim to exact source page and text.

---

## 2. In-Scope vs Out-of-Scope (MVP)

### In-Scope (Strictly Enforced)
- **Input**: Digital and scanned PDF documents only (up to 10 MB).
- **Supported Categories**:
  - `scholarship`: College/university financial aid circulars, renewal notices
  - `bank`: KYC refresh, account dormancy warnings, mandate updates
  - `utility`: Disconnection notices, tariff changes, meter replacement instructions
  - `tax`: Advance tax reminders, municipal property tax notices, compliance orders
  - `govt_scheme`: Subsidy applications, registration windows, welfare schemes
- **Outputs**:
  - Strict JSON compliant with `schema/notice.schema.json`
  - Zero hallucination policy: missing fields default to `null` with status `not_found`
  - High-contrast responsive dashboard displaying deadline cards, step checklists, and warnings.

### Out-of-Scope (MVP)
- Auto-submitting forms or logging into third-party portals
- Automated payments or direct debit setup
- Legal or financial advice
- Photo uploads (JPEG/PNG directly without PDF wrapper)
- Messaging integration (SMS, WhatsApp, Telegram)
- Regional languages (MVP targets English language notices; non-English flagged as unsupported)

---

## 3. Reliability Targets
- Document classification accuracy: $\ge 90\%$
- Critical deadline precision: $\ge 95\%$
- Action step precision & recall: $\ge 85\%$
- Verbatim evidence traceability: $100\%$ on extracted critical elements
- Zero unsupported critical instructions.
