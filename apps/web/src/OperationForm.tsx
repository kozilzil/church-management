import { useState, type FormEvent } from 'react';
export type OpField = {
  name: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  optional?: boolean;
  value?: string;
};
export function OperationForm({
  title,
  fields,
  submit,
}: {
  title: string;
  fields: OpField[];
  submit: (d: Record<string, string>) => Promise<void>;
}) {
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const d = Object.fromEntries(
      fields
        .map((f) => [f.name, String(data.get(f.name) ?? '')])
        .filter(([k, v]) => v || !fields.find((f) => f.name === k)?.optional),
    );
    setBusy(true);
    setMessage('');
    try {
      await submit(d);
      setMessage('저장했습니다.');
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form" onSubmit={send}>
      <h3>{title}</h3>
      <div className="fields">
        {fields.map((f) => (
          <label key={f.name}>
            {f.label}
            {f.options ? (
              <select name={f.name} required={!f.optional} defaultValue={f.value ?? ''}>
                <option value="">선택하세요</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name={f.name}
                type={f.type ?? 'text'}
                required={!f.optional}
                defaultValue={f.value ?? ''}
                maxLength={300}
              />
            )}
          </label>
        ))}
      </div>
      <button disabled={busy}>저장</button>
      <p role="status">{message}</p>
    </form>
  );
}
