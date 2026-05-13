
import './DataTable.css';

interface DataTableProps {
  title?: string;
  headers: string[];
  rows: string[][];
}

export function DataTable({ title, headers, rows }: DataTableProps) {
  return (
    <div className="data-table">
      {title && <div className="data-table__title">{title}</div>}
      <div className="data-table__scroll">
        <table className="data-table__table">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="data-table__th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="data-table__tr">
                {row.map((cell, j) => (
                  <td key={j} className="data-table__td">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
