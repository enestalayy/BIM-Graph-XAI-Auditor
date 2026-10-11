import { ApiError } from '../api/client.ts';

export function ErrorMessage({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  const issues = error instanceof ApiError ? error.issues : [];
  return (
    <div className="error" role="alert">
      <div>{issues.length ? 'Kural doğrulanamadı:' : message}</div>
      {issues.length > 0 && (
        <ul>
          {issues.map((issue) => <li key={issue}><code>{issue}</code></li>)}
        </ul>
      )}
    </div>
  );
}
