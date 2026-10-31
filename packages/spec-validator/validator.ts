/**
 * SpecForge - OpenAPI 3.1 Specification Linter & Compliance Validator
 */

export interface OpenAPISpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, Record<string, any>>;
  components?: { securitySchemes?: Record<string, any> };
}

export interface ValidationIssue {
  severity: 'ERROR' | 'WARNING' | 'INFO';
  path: string;
  message: string;
}

export class SpecForgeValidator {
  /**
   * Validate OpenAPI 3.1 spec against security and compliance rules.
   */
  public static validate(spec: OpenAPISpec): { score: number; issues: ValidationIssue[] } {
    const issues: ValidationIssue[] = [];

    // Rule 1: OpenAPI version check
    if (!spec.openapi || !spec.openapi.startsWith('3.')) {
      issues.push({
        severity: 'ERROR',
        path: 'openapi',
        message: 'Spec must declare OpenAPI 3.x version string'
      });
    }

    // Rule 2: Security Schemes Check
    const hasSecurity = spec.components?.securitySchemes && Object.keys(spec.components.securitySchemes).length > 0;
    if (!hasSecurity) {
      issues.push({
        severity: 'WARNING',
        path: 'components.securitySchemes',
        message: 'No global security schemes defined in components'
      });
    }

    // Rule 3: Path and Response status checks
    if (!spec.paths || Object.keys(spec.paths).length === 0) {
      issues.push({
        severity: 'ERROR',
        path: 'paths',
        message: 'API specification contains no paths'
      });
    } else {
      for (const [pathUrl, methods] of Object.entries(spec.paths)) {
        for (const [method, operation] of Object.entries(methods)) {
          if (typeof operation !== 'object' || !operation) continue;

          if (!operation.summary && !operation.description) {
            issues.push({
              severity: 'INFO',
              path: `paths.${pathUrl}.${method}`,
              message: `Operation '${method.toUpperCase()} ${pathUrl}' is missing a summary or description`
            });
          }

          if (!operation.responses || Object.keys(operation.responses).length === 0) {
            issues.push({
              severity: 'ERROR',
              path: `paths.${pathUrl}.${method}.responses`,
              message: `Operation '${method.toUpperCase()} ${pathUrl}' has no response codes defined`
            });
          }
        }
      }
    }

    const errorsCount = issues.filter(i => i.severity === 'ERROR').length;
    const warningsCount = issues.filter(i => i.severity === 'WARNING').length;
    const score = Math.max(0, 100 - (errorsCount * 25) - (warningsCount * 10));

    return { score, issues };
  }
}
