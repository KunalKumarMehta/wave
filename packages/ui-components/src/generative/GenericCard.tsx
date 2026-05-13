import './GenericCard.css';

interface GenericCardProps {
  title: string;
  content: string;
  footer?: string;
  icon?: string;
}

export function GenericCard({ title, content, footer, icon }: GenericCardProps) {
  return (
    <div className="generic-card">
      <div className="generic-card__header">
        {icon && <span className="generic-card__icon">{icon}</span>}
        <span className="generic-card__title">{title}</span>
      </div>
      <div className="generic-card__content">{content}</div>
      {footer && <div className="generic-card__footer">{footer}</div>}
    </div>
  );
}
