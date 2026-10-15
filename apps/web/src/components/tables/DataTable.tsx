import type { ReactNode } from 'react';

export type DataTableColumn<Row> = {
  id: string;
  header: string;
  cell: (row: Row) => ReactNode;
  className?: string;
};

type DataTableProps<Row> = {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  getRowId: (row: Row) => string;
  emptyMessage: string;
  isLoading?: boolean;
};

export function DataTable<Row>({
  columns,
  rows,
  getRowId,
  emptyMessage,
  isLoading = false,
}: DataTableProps<Row>) {
  return (
    <div className="data-table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th className={column.className} key={column.id} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td className="data-table-empty" colSpan={columns.length}>
                Завантажуємо події з U‑PROX…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td className="data-table-empty" colSpan={columns.length}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={getRowId(row)}>
                {columns.map((column) => (
                  <td className={column.className} key={column.id}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
