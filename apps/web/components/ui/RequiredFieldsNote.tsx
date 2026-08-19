// Drop near the top of any form that has required fields, next to the ones
// marked via Input/Select's `required` prop -- explains what the red * means,
// the same convention as Salesforce's "* = Required Information".
export function RequiredFieldsNote() {
  return (
    <p className="font-body text-xs text-muted">
      <span className="text-status-danger" aria-hidden="true">
        *
      </span>{' '}
      = Required field
    </p>
  );
}
