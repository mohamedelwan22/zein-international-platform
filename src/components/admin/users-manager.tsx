"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ROLES, type Role } from "@/server/auth/permissions";

/**
 * Admin Users module (US12, T090, admin-api.md §8).
 *
 * Super Admin staff management: create accounts, assign roles, activate/
 * deactivate, and reset passwords. The server re-enforces `users:*` on every
 * call, and a stale `version` (409) asks the operator to reload rather than
 * silently overwriting another edit. Deactivation immediately revokes the
 * account's session (US12.4).
 */

export interface UserRowData {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  version: number;
  lastLoginAt: string | null;
  createdAt: string;
}

const ROLE_LABEL_KEY: Record<Role, string> = {
  SuperAdmin: "roleSuperAdmin",
  ContentManager: "roleContentManager",
  ProductManager: "roleProductManager",
  SalesBusiness: "roleSalesBusiness",
};

export function UsersManager({
  users,
  canCreate,
  canUpdate,
  currentUserId,
  locale,
}: {
  users: UserRowData[];
  canCreate: boolean;
  canUpdate: boolean;
  currentUserId: string;
  locale: string;
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const formatDate = (raw: string | null) => {
    if (!raw) return "—";
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? "—" : dateFmt.format(parsed);
  };

  return (
    <section className="flex flex-col gap-8">
      <div>
        <h1 className="text-h2 font-bold text-zain-green-950">{t("users")}</h1>
        <p className="mt-2 max-w-3xl text-body text-zain-charcoal">{t("usersIntro")}</p>
      </div>

      {canCreate ? <CreateUserForm onDone={() => router.refresh()} /> : null}

      {users.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zain-green-950/20 bg-white p-10">
          <h2 className="text-h3 font-semibold text-zain-green-950">{t("noUsers")}</h2>
          <p className="mt-2 text-body text-zain-charcoal">{t("noUsersBody")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zain-green-950/10 bg-white">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-zain-green-950/10 text-meta uppercase tracking-wide text-zain-green-700">
                <th className="px-4 py-3 text-start">{t("usersTableName")}</th>
                <th className="px-4 py-3 text-start">{t("usersTableEmail")}</th>
                <th className="px-4 py-3 text-start">{t("usersTableRole")}</th>
                <th className="px-4 py-3 text-start">{t("usersTableStatus")}</th>
                <th className="px-4 py-3 text-start">{t("usersTableLastLogin")}</th>
                {canUpdate ? <th className="px-4 py-3 text-start">{t("usersTableActions")}</th> : null}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  canUpdate={canUpdate}
                  isSelf={user.id === currentUserId}
                  roleLabel={(role) => t(ROLE_LABEL_KEY[role] as never)}
                  formatDate={formatDate}
                  onDone={() => router.refresh()}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CreateUserForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations("admin");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("ContentManager");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, role, password }),
      });
      if (response.ok) {
        setFeedback({ tone: "ok", text: t("userCreated") });
        setEmail("");
        setName("");
        setPassword("");
        onDone();
      } else if (response.status === 400) {
        setFeedback({ tone: "error", text: t("userCreateInvalid") });
      } else {
        setFeedback({ tone: "error", text: t("userActionFailed") });
      }
    } catch {
      setFeedback({ tone: "error", text: t("userActionFailed") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-5 rounded-lg border border-zain-green-950/10 bg-zain-cream-50/40 p-5 md:p-6"
    >
      <h2 className="text-h3 font-semibold text-zain-green-950">{t("usersCreateHeading")}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-body text-zain-green-950">
          <span className="text-meta font-semibold">{t("userNameLabel")}</span>
          <input
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            className="min-h-11 rounded-sm border border-zain-green-950/25 bg-white px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-body text-zain-green-950">
          <span className="text-meta font-semibold">{t("userEmailLabel")}</span>
          <input
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="min-h-11 rounded-sm border border-zain-green-950/25 bg-white px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-body text-zain-green-950">
          <span className="text-meta font-semibold">{t("userRoleLabel")}</span>
          <select
            name="role"
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
            className="min-h-11 rounded-sm border border-zain-green-950/25 bg-white px-3 py-2"
          >
            {ROLES.map((option) => (
              <option key={option} value={option}>
                {t(ROLE_LABEL_KEY[option] as never)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-body text-zain-green-950">
          <span className="text-meta font-semibold">{t("userPasswordLabel")}</span>
          <input
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={12}
            autoComplete="new-password"
            className="min-h-11 rounded-sm border border-zain-green-950/25 bg-white px-3 py-2"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 items-center justify-center rounded-sm bg-zain-green-950 px-6 py-2.5 text-body font-semibold text-zain-cream-50 hover:bg-zain-green-900 disabled:opacity-60"
        >
          {busy ? t("userCreating") : t("userCreateSubmit")}
        </button>
        {feedback ? (
          <span
            role="status"
            className={feedback.tone === "ok" ? "text-body text-zain-green-700" : "text-body text-red-700"}
          >
            {feedback.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function UserRow({
  user,
  canUpdate,
  isSelf,
  roleLabel,
  formatDate,
  onDone,
}: {
  user: UserRowData;
  canUpdate: boolean;
  isSelf: boolean;
  roleLabel: (role: Role) => string;
  formatDate: (raw: string | null) => string;
  onDone: () => void;
}) {
  const t = useTranslations("admin");
  const [role, setRole] = useState<Role>(user.role);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function mutate(body: Record<string, unknown>, okText: string, url = `/api/admin/users/${user.id}`) {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(url, {
        method: url.endsWith("/reset-password") ? "POST" : url.endsWith("/deactivate") ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        setFeedback({ tone: "ok", text: okText });
        onDone();
      } else if (response.status === 409) {
        setFeedback({ tone: "error", text: t("userVersionConflict") });
      } else if (response.status === 400) {
        setFeedback({ tone: "error", text: t("userGuardBlocked") });
      } else {
        setFeedback({ tone: "error", text: t("userActionFailed") });
      }
    } catch {
      setFeedback({ tone: "error", text: t("userActionFailed") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-b border-zain-green-950/5 align-top">
      <td className="px-4 py-3 text-body font-semibold text-zain-green-950">
        {user.name}
        {isSelf ? <span className="ms-2 text-meta text-zain-green-700">({t("usersYou")})</span> : null}
      </td>
      <td className="px-4 py-3 text-body text-zain-charcoal" dir="ltr">
        {user.email}
      </td>
      <td className="px-4 py-3 text-body text-zain-charcoal">
        {canUpdate ? (
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
            disabled={busy}
            aria-label={t("usersTableRole")}
            className="min-h-9 rounded-sm border border-zain-green-950/25 bg-white px-2 py-1 text-body"
          >
            {ROLES.map((option) => (
              <option key={option} value={option}>
                {roleLabel(option)}
              </option>
            ))}
          </select>
        ) : (
          roleLabel(user.role)
        )}
      </td>
      <td className="px-4 py-3 text-body text-zain-charcoal">
        {user.active ? t("userStatusActive") : t("userStatusInactive")}
      </td>
      <td className="px-4 py-3 text-body text-zain-charcoal">{formatDate(user.lastLoginAt)}</td>
      {canUpdate ? (
        <td className="px-4 py-3">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {role !== user.role ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void mutate({ role, version: user.version }, t("userRoleUpdated"))}
                  className="min-h-9 rounded-sm bg-zain-green-950 px-3 py-1 text-meta font-semibold text-zain-cream-50 disabled:opacity-60"
                >
                  {t("userSaveRole")}
                </button>
              ) : null}

              {user.active ? (
                <button
                  type="button"
                  disabled={busy || isSelf}
                  onClick={() =>
                    void mutate(
                      { active: false, version: user.version },
                      t("userDeactivated"),
                      `/api/admin/users/${user.id}/deactivate`,
                    )
                  }
                  className="min-h-9 rounded-sm border border-red-700/40 px-3 py-1 text-meta font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("userDeactivate")}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void mutate({ active: true, version: user.version }, t("userReactivated"))}
                  className="min-h-9 rounded-sm border border-zain-green-950/25 px-3 py-1 text-meta font-semibold text-zain-green-950 hover:bg-zain-green-950/5 disabled:opacity-60"
                >
                  {t("userReactivate")}
                </button>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={() => setResetting((prev) => !prev)}
                className="min-h-9 rounded-sm border border-zain-green-950/25 px-3 py-1 text-meta font-semibold text-zain-green-950 hover:bg-zain-green-950/5 disabled:opacity-60"
              >
                {t("userResetPassword")}
              </button>
            </div>

            {resetting ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  value={newPassword}
                  minLength={12}
                  autoComplete="new-password"
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder={t("userNewPasswordLabel")}
                  className="min-h-9 min-w-48 rounded-sm border border-zain-green-950/25 bg-white px-2 py-1 text-body"
                />
                <button
                  type="button"
                  disabled={busy || newPassword.length < 12}
                  onClick={() =>
                    void mutate(
                      { password: newPassword },
                      t("userResetDone"),
                      `/api/admin/users/${user.id}/reset-password`,
                    )
                  }
                  className="min-h-9 rounded-sm bg-zain-green-950 px-3 py-1 text-meta font-semibold text-zain-cream-50 disabled:opacity-60"
                >
                  {t("userResetSubmit")}
                </button>
              </div>
            ) : null}

            {feedback ? (
              <span
                role="status"
                className={feedback.tone === "ok" ? "text-meta text-zain-green-700" : "text-meta text-red-700"}
              >
                {feedback.text}
              </span>
            ) : null}
          </div>
        </td>
      ) : null}
    </tr>
  );
}
