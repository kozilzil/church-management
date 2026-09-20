import { useState } from 'react';
import { api } from './api';
type Named = { id: string; name: string };
export function ScopePanel({
  root,
  users,
  organizations,
  members,
}: {
  root: string;
  users: { id: string; username: string }[];
  organizations: Named[];
  members: Named[];
}) {
  const [user, setUser] = useState(''),
    [mode, setMode] = useState('NONE'),
    [memberId, setMember] = useState(''),
    [entries, setEntries] = useState<{ organizationId: string; descendants: boolean }[]>([]),
    [message, setMessage] = useState('');
  async function select(id: string) {
    setUser(id);
    setMessage('');
    if (!id) return;
    try {
      const s = await api<{ mode: string; memberId: string | null; organizations: typeof entries }>(
        `${root}/identity/users/${id}/scope`,
      );
      setMode(s.mode);
      setMember(s.memberId ?? '');
      setEntries(s.organizations);
    } catch (e) {
      setMessage(String(e));
    }
  }
  return (
    <section className="form">
      <h3>데이터 접근 범위</h3>
      <label>
        사용자
        <select value={user} onChange={(e) => void select(e.target.value)}>
          <option value="">선택하세요</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.username}
            </option>
          ))}
        </select>
      </label>
      <label>
        범위
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          {[
            ['NONE', '접근 없음'],
            ['ALL', '전체 교회'],
            ['ORGANIZATIONS', '담당 조직'],
            ['SELF', '본인'],
          ].map(([v, n]) => (
            <option key={v} value={v}>
              {n}
            </option>
          ))}
        </select>
      </label>
      {mode === 'SELF' && (
        <label>
          본인 교인
          <select value={memberId} onChange={(e) => setMember(e.target.value)}>
            <option value="">선택하세요</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {mode === 'ORGANIZATIONS' &&
        organizations.map((o) => {
          const entry = entries.find((e) => e.organizationId === o.id);
          return (
            <div key={o.id}>
              <label>
                <input
                  type="checkbox"
                  checked={!!entry}
                  onChange={(e) =>
                    setEntries(
                      e.target.checked
                        ? [...entries, { organizationId: o.id, descendants: false }]
                        : entries.filter((x) => x.organizationId !== o.id),
                    )
                  }
                />
                {o.name}
              </label>
              {entry && (
                <label>
                  <input
                    type="checkbox"
                    checked={entry.descendants}
                    onChange={(e) =>
                      setEntries(
                        entries.map((x) =>
                          x.organizationId === o.id ? { ...x, descendants: e.target.checked } : x,
                        ),
                      )
                    }
                  />
                  하위 조직 포함
                </label>
              )}
            </div>
          );
        })}
      <p>
        범위 변경 시 해당 사용자의 모든 세션이 종료됩니다. 조직·본인 제한 사용자는 공유 조직/가족
        구조를 변경할 수 없습니다.
      </p>
      <button
        disabled={!user}
        onClick={async () => {
          try {
            await api(
              `${root}/identity/users/${user}/scope`,
              {
                mode,
                memberId: mode === 'SELF' ? memberId : null,
                organizations: mode === 'ORGANIZATIONS' ? entries : [],
              },
              'PUT',
            );
            setMessage('범위를 저장했습니다.');
          } catch (e) {
            setMessage(String(e));
          }
        }}
      >
        범위 저장
      </button>
      <p role="status">{message}</p>
    </section>
  );
}
