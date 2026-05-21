/*
 * 020_Page_Header.tsx
 * Consistent page heading and command row.
 */

export function PageHeader({ title, description, actions }: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="topbar">
      <div>
        <h2>{title}</h2>
        {description ? <p title={description}>{description}</p> : null}
      </div>
      {actions ? <div className="toolbar">{actions}</div> : null}
    </div>
  );
}
