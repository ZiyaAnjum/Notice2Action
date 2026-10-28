# Notice to Action - Evaluation Benchmark Report

- **Execution Timestamp**: 2026-10-25T21:12:38.123485
- **Prompt Version**: `1.0.0`
- **Evaluation Mode**: `deterministic_fake`
- **Model / Provider**: `FakeLLMClient`
- **Test Suite Size**: 3 notices

> [!NOTE]
> **Small Sample Size Disclaimer**: This evaluation was executed on a curated test suite of 3 notices. Per PRD Section 9, targets are benchmark criteria; the numbers below represent honest, objective measurements on this test suite and should be considered preliminary rather than statistically definitive claims for broad distribution.

## 1. Targets vs. Measured (PRD Section 9)

| Metric | Target | Measured | Target Met |
|---|---|---|---|
| **Classification Accuracy** | >= 90% | 100.0% | **PASSED** |
| **Critical Deadline Precision** | >= 95% | 100.0% | **PASSED** |
| **Required Action Precision** | >= 85% | 100.0% | **PASSED** |
| **Required Action Recall** | >= 85% | 100.0% | **PASSED** |
| **Unsupported Critical Instructions** | = 0 | 0 | **PASSED** |
| **Processing Time** | <= 60.0s max | 0.0s (max) | **PASSED** |

## 2. Classification & Scope Refusal Performance

- **Classification Accuracy**: 100.0% (3/3)
- **Correct Refusal Rate**: 100.0% (2/2 unreadable/out-of-scope cases refused without LLM)
- **False Refusal Rate**: 0.0% (0/1 supported notices wrongly refused)

### Confusion Matrix

| Expected \ Predicted | other_out_of_scope | tax_or_payment |
|---| --- | --- |
| **other_out_of_scope** | 2 | 0 |
| **tax_or_payment** | 0 | 1 |

## 3. Information Extraction Quality

| Extraction Category | Precision | Recall | TP | FP | FN | Invented Count |
|---|---|---|---|---|---|---|
| **Explicit Deadlines** | 100.0% | 100.0% | 1 | 0 | 0 | [] |
| **Required Documents** | 100.0% | 100.0% | 2 | 0 | 0 | - |
| **Action Steps** | 100.0% | 100.0% | 3 | 0 | 0 | - |
| **Combined Required Actions** | **100.0%** | **100.0%** | 5 | 0 | 0 | - |

- **Submission Channel Match Rate**: 100.0%
- **Evidence Grounding Rate**: 100.0% (10/10 quotes verified against PDF text)
- **Unsupported Critical Instructions**: **0** (PRD Target = 0)
- **Uncertainty Handling Adherence**: 100.0%

## 4. Processing Time & Latency

- **Mean**: 0.02s
- **Median**: 0.02s
- **Max**: 0.03s
- **Over 60 seconds**: 0

## 5. Per-Notice Evaluation Summary

| Notice ID | Exp. Category | Pred. Category | Category Match | Status | Deadlines (TP/FP/FN) | Grounding Rate | Time (s) |
|---|---|---|---|---|---|---|---|
| `recipe_unrelated` | `other_out_of_scope` | `other_out_of_scope` | YES | `out_of_scope` | 0/0/0 | N/A | 0.03s |
| `scanned_image_only` | `other_out_of_scope` | `other_out_of_scope` | YES | `needs_clearer_document` | 0/0/0 | N/A | 0.01s |
| `tax_or_payment` | `tax_or_payment` | `tax_or_payment` | YES | `success` | 1/0/0 | 100% | 0.02s |

## 6. Failure & Discrepancy Analysis

No failures or discrepancies detected across evaluated notices.