export function PageHeader({ icon: Icon, eyebrow, title, description, actions }) {
  return (
    <header className="page-heading">
      <div className="page-heading-copy">
        {Icon && (
          <span className="page-heading-icon" aria-hidden="true">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="page-heading-eyebrow">{eyebrow}</p>}
          <h1 className="page-heading-title">{title}</h1>
          {description && <p className="page-heading-description">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5 shrink-0">{actions}</div>}
    </header>
  );
}
