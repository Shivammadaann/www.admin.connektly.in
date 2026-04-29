import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  Building2,
  Camera,
  Globe2,
  Loader2,
  LockKeyhole,
  Mail,
  Phone,
  RefreshCcw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  User,
  Users,
  XCircle,
} from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import type { AdminPermissionKey, AdminUserRow, DashboardAdminUsersResponse, OwnerSettingsResponse } from '../lib/types';
import { formatDateTime, getInitials, labelize } from '../lib/format';
import Panel from '../components/Panel';
import StatusBadge from '../components/StatusBadge';

type OwnerProfile = OwnerSettingsResponse['profile'];
type OwnerForm = Omit<OwnerProfile, 'adminUserId' | 'loginEmail' | 'avatarUrl' | 'updatedAt'>;
type AdminInviteForm = {
  email: string;
  fullName: string;
  roleTitle: string;
  permissions: AdminPermissionKey[];
};
type TabId =
  | 'profile'
  | 'organization'
  | 'security'
  | 'users'
  | 'notifications';

const tabs: Array<{ id: TabId; label: string; Icon: typeof User }> = [
  { id: 'profile', label: 'Profile Management', Icon: User },
  { id: 'organization', label: 'Organization Management', Icon: Globe2 },
  { id: 'security', label: 'Security', Icon: ShieldCheck },
  { id: 'users', label: 'User Management', Icon: Users },
  { id: 'notifications', label: 'Notifications', Icon: Bell },
];

const timezones = ['Asia/Kolkata', 'UTC', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'America/Los_Angeles'];
const defaultInvitePermissions: AdminPermissionKey[] = ['command_center'];

const inputClass =
  'w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-950 outline-none transition focus:border-[#5b45ff] focus:ring-1 focus:ring-[#5b45ff]';

const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500';

function formFromProfile(profile: OwnerProfile): OwnerForm {
  return {
    email: profile.email || '',
    fullName: profile.fullName || '',
    phone: profile.phone || '',
    organizationName: profile.organizationName || '',
    organizationWebsite: profile.organizationWebsite || '',
    roleTitle: profile.roleTitle || '',
    timezone: profile.timezone || 'Asia/Kolkata',
    dashboardTheme: profile.dashboardTheme || 'system',
    density: profile.density || 'comfortable',
    accentColor: profile.accentColor || '#5b45ff',
    notifications: profile.notifications,
  };
}

function publishOwnerProfile(profile: OwnerProfile) {
  window.dispatchEvent(new CustomEvent('owner-profile-updated', { detail: profile }));
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-gray-950">{title}</span>
        <span className="mt-1 block text-sm leading-6 text-gray-500">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 shrink-0 rounded border-gray-300 text-[#5b45ff]"
      />
    </label>
  );
}

export default function OwnerSettingsPage() {
  const [settings, setSettings] = useState<OwnerSettingsResponse | null>(null);
  const [form, setForm] = useState<OwnerForm | null>(null);
  const [adminUsers, setAdminUsers] = useState<DashboardAdminUsersResponse | null>(null);
  const [organizationUsers, setOrganizationUsers] = useState<AdminUserRow[]>([]);
  const [inviteForm, setInviteForm] = useState<AdminInviteForm>({
    email: '',
    fullName: '',
    roleTitle: 'Admin',
    permissions: defaultInvitePermissions,
  });
  const [accountForm, setAccountForm] = useState({ loginEmail: '', newPassword: '', confirmPassword: '' });
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [adminActionId, setAdminActionId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      setIsLoading(true);
      const response = await adminApi.getOwnerSettings();
      setSettings(response);
      setForm(formFromProfile(response.profile));
      setAccountForm({ loginEmail: response.profile.loginEmail || '', newPassword: '', confirmPassword: '' });
      if (response.access.canManageAdmins) {
        const [admins, usersResponse] = await Promise.all([
          adminApi.getDashboardAdmins(),
          adminApi.getUsers().catch(() => ({ users: [] as AdminUserRow[], generatedAt: '' })),
        ]);
        setAdminUsers(admins);
        setOrganizationUsers(usersResponse.users.filter((user) => Boolean(user.email)));
      } else {
        setAdminUsers(null);
        setOrganizationUsers([]);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load admin settings.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const avatarPreview = useMemo(() => {
    if (!settings?.profile.avatarUrl) return null;
    return `${settings.profile.avatarUrl}${settings.profile.avatarUrl.includes('?') ? '&' : '?'}v=${Date.parse(
      settings.profile.updatedAt || settings.generatedAt,
    )}`;
  }, [settings]);

  const saveSettings = async (payload: Partial<OwnerProfile>, successMessage = 'Admin settings saved.') => {
    try {
      setIsSaving(true);
      setError(null);
      setNotice(null);
      const response = await adminApi.updateOwnerProfile(payload);
      setSettings(response);
      setForm(formFromProfile(response.profile));
      publishOwnerProfile(response.profile);
      setNotice(response.warning || successMessage);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save admin settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const uploadPhoto = async (file: File | undefined) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Upload a PNG, JPEG, or WEBP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Photo must be 5 MB or smaller.');
      return;
    }

    try {
      setIsUploading(true);
      setError(null);
      setNotice(null);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read selected image.'));
        reader.readAsDataURL(file);
      });
      const response = await adminApi.updateOwnerProfilePhoto({ dataUrl });
      setSettings(response);
      setForm(formFromProfile(response.profile));
      publishOwnerProfile(response.profile);
      setNotice(response.warning || 'Profile photo updated.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to update profile photo.');
    } finally {
      setIsUploading(false);
    }
  };

  const toggleInvitePermission = (permission: AdminPermissionKey, checked: boolean) => {
    setInviteForm((current) => {
      const next = checked ? [...new Set([...current.permissions, permission])] : current.permissions.filter((item) => item !== permission);
      return { ...current, permissions: next };
    });
  };

  const toggleAdminPermission = (adminId: string, permission: AdminPermissionKey, checked: boolean) => {
    setAdminUsers((current) =>
      current
        ? {
            ...current,
            admins: current.admins.map((admin) =>
              admin.id === adminId
                ? {
                    ...admin,
                    permissions: checked
                      ? [...new Set([...admin.permissions, permission])]
                      : admin.permissions.filter((item) => item !== permission),
                  }
                : admin,
            ),
          }
        : current,
    );
  };

  const saveAccount = async () => {
    if (!accountForm.loginEmail) {
      setError('Login email is required.');
      return;
    }
    if (accountForm.newPassword || accountForm.confirmPassword) {
      if (accountForm.newPassword !== accountForm.confirmPassword) {
        setError('New password and confirmation do not match.');
        return;
      }
      if (accountForm.newPassword.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
    }

    try {
      setIsSaving(true);
      setError(null);
      setNotice(null);
      const response = await adminApi.updateOwnerAccount({
        loginEmail: accountForm.loginEmail,
        newPassword: accountForm.newPassword || undefined,
      });
      setSettings(response);
      setForm(formFromProfile(response.profile));
      setAccountForm({ loginEmail: response.profile.loginEmail || accountForm.loginEmail, newPassword: '', confirmPassword: '' });
      publishOwnerProfile(response.profile);
      setNotice('Login credentials updated.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to update login credentials.');
    } finally {
      setIsSaving(false);
    }
  };

  const inviteAdmin = async () => {
    try {
      setAdminActionId('invite');
      setError(null);
      setNotice(null);
      const response = await adminApi.inviteDashboardAdmin(inviteForm);
      setAdminUsers(response);
      setInviteForm({ email: '', fullName: '', roleTitle: 'Admin', permissions: defaultInvitePermissions });
      setNotice(response.warning || 'Dashboard admin invited.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to invite dashboard admin.');
    } finally {
      setAdminActionId(null);
    }
  };

  const useOrganizationUserForInvite = (userId: string) => {
    const user = organizationUsers.find((item) => item.userId === userId);
    if (!user) return;
    setInviteForm((current) => ({
      ...current,
      email: user.email || current.email,
      fullName: user.fullName || current.fullName,
      roleTitle: current.roleTitle || 'Admin',
    }));
  };

  const saveAdminAccess = async (adminId: string) => {
    const admin = adminUsers?.admins.find((item) => item.id === adminId);
    if (!admin) return;

    try {
      setAdminActionId(adminId);
      setError(null);
      setNotice(null);
      const response = await adminApi.updateDashboardAdmin(adminId, {
        fullName: admin.fullName,
        roleTitle: admin.roleTitle,
        status: admin.status,
        permissions: admin.permissions,
      });
      setAdminUsers(response);
      setNotice('Dashboard admin access saved.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save dashboard admin.');
    } finally {
      setAdminActionId(null);
    }
  };

  const removeAdminAccess = async (adminId: string) => {
    try {
      setAdminActionId(adminId);
      setError(null);
      setNotice(null);
      const response = await adminApi.removeDashboardAdmin(adminId);
      setAdminUsers(response);
      setNotice('Dashboard admin removed.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to remove dashboard admin.');
    } finally {
      setAdminActionId(null);
    }
  };

  if (isLoading && !settings) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#5b45ff]" />
      </div>
    );
  }

  if (!settings || !form) {
    return (
      <div className="mx-auto max-w-3xl rounded-[28px] border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        {error || 'Admin settings are not available.'}
      </div>
    );
  }

  const updateNotification = (key: keyof OwnerProfile['notifications'], checked: boolean) => {
    setForm((current) =>
      current
        ? {
            ...current,
            notifications: {
              ...current.notifications,
              [key]: checked,
            },
          }
        : current,
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {settings.warning ? (
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800 shadow-sm">
          {settings.warning}
        </div>
      ) : null}

      <section className="rounded-[24px] border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-950">Admin Profile</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-gray-500">
              Manage the admin identity, organization details, login security, dashboard users, and internal alert preferences.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-6 lg:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="h-fit rounded-[24px] border border-gray-200 bg-white p-3 shadow-sm">
          <nav className="space-y-1">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                    isActive ? 'bg-[#5b45ff] text-white shadow-lg shadow-[#5b45ff]/20' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950'
                  }`}
                >
                  <tab.Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                  <span className="min-w-0 truncate">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 space-y-6">
          {activeTab === 'profile' ? (
            <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              <Panel title="Profile Picture" className="h-fit">
                <div className="rounded-[24px] border border-dashed border-gray-200 bg-gray-50 px-5 py-8 text-center">
                  <div className="mx-auto flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-[#dffbea] text-3xl font-bold text-emerald-600 shadow-lg">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt={settings.profile.fullName} className="h-full w-full object-cover" />
                    ) : (
                      getInitials(settings.profile.fullName)
                    )}
                  </div>
                  <h2 className="mt-5 text-lg font-bold text-gray-950">{settings.profile.fullName}</h2>
                  <p className="mt-2 text-sm leading-6 text-gray-500">Admin account profile image</p>
                  <label className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-50">
                    {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    Change Photo
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      disabled={isUploading}
                      onChange={(event) => void uploadPhoto(event.target.files?.[0])}
                    />
                  </label>
                </div>
              </Panel>

              <div className="space-y-6">
                <Panel title="Full Name">
                  <div className="flex flex-col gap-3 md:flex-row">
                    <div className="relative min-w-0 flex-1">
                      <User className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                      <input
                        value={form.fullName}
                        onChange={(event) => setForm((current) => (current ? { ...current, fullName: event.target.value } : current))}
                        className={`${inputClass} pl-12`}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => void saveSettings({ fullName: form.fullName }, 'Full name saved.')}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#4c38e0] disabled:opacity-60"
                    >
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save Full Name
                    </button>
                  </div>
                </Panel>

                <Panel title="Contact Number">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="relative">
                        <Phone className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                        <input
                          value={form.phone}
                          onChange={(event) => setForm((current) => (current ? { ...current, phone: event.target.value } : current))}
                          className={`${inputClass} pl-12`}
                          placeholder="+91 9999999999"
                        />
                      </div>
                      <p className="mt-2 text-sm text-gray-500">Primary owner contact number</p>
                    </div>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => void saveSettings({ phone: form.phone }, 'Contact number saved.')}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 disabled:opacity-60"
                    >
                      <Phone className="h-4 w-4" />
                      Save Number
                    </button>
                  </div>
                </Panel>

                <Panel title="Email Address">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                        <input
                          type="email"
                          value={form.email || ''}
                          onChange={(event) => setForm((current) => (current ? { ...current, email: event.target.value } : current))}
                          className={`${inputClass} pl-12`}
                          placeholder="owner@connektly.in"
                        />
                      </div>
                      <p className="mt-2 text-sm text-gray-500">Login email: {settings.profile.loginEmail || 'Not available'}</p>
                    </div>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => void saveSettings({ email: form.email }, 'Owner email saved.')}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 disabled:opacity-60"
                    >
                      <Mail className="h-4 w-4" />
                      Update Email
                    </button>
                  </div>
                </Panel>
              </div>
            </div>
          ) : null}

          {activeTab === 'organization' ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <Panel title="Organization Details">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className={labelClass}>Organization Name</span>
                    <div className="relative">
                      <Building2 className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                      <input
                        value={form.organizationName}
                        onChange={(event) => setForm((current) => (current ? { ...current, organizationName: event.target.value } : current))}
                        className={`${inputClass} pl-12`}
                      />
                    </div>
                  </label>
                  <label className="block">
                    <span className={labelClass}>Role Title</span>
                    <input
                      value={form.roleTitle}
                      onChange={(event) => setForm((current) => (current ? { ...current, roleTitle: event.target.value } : current))}
                      className={inputClass}
                      placeholder="Owner"
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Website</span>
                    <input
                      value={form.organizationWebsite}
                      onChange={(event) =>
                        setForm((current) => (current ? { ...current, organizationWebsite: event.target.value } : current))
                      }
                      className={inputClass}
                      placeholder="https://connektly.in"
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Timezone</span>
                    <select
                      value={form.timezone}
                      onChange={(event) => setForm((current) => (current ? { ...current, timezone: event.target.value } : current))}
                      className={inputClass}
                    >
                      {timezones.map((timezone) => (
                        <option key={timezone} value={timezone}>
                          {timezone}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() =>
                    void saveSettings(
                      {
                        organizationName: form.organizationName,
                        organizationWebsite: form.organizationWebsite,
                        roleTitle: form.roleTitle,
                        timezone: form.timezone,
                      },
                      'Organization settings saved.',
                    )
                  }
                  className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#4c38e0] disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Organization
                </button>
              </Panel>

                <Panel title="Admin Card">
                <div className="rounded-[24px] border border-gray-200 bg-gray-50 p-5 text-center">
                  <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-white text-xl font-bold text-[#5b45ff] shadow-sm">
                    {avatarPreview ? <img src={avatarPreview} alt={form.fullName} className="h-full w-full object-cover" /> : getInitials(form.fullName)}
                  </div>
                  <h3 className="mt-4 text-xl font-bold text-gray-950">{form.fullName}</h3>
                  <p className="mt-1 text-sm text-gray-500">{form.roleTitle || 'Admin'}</p>
                  <div className="mt-4 rounded-2xl bg-white p-4 text-left text-sm">
                    <p className="font-semibold text-gray-950">{form.organizationName || 'Connektly'}</p>
                    <p className="mt-1 truncate text-gray-500">{form.organizationWebsite || 'No website saved'}</p>
                  </div>
                </div>
              </Panel>
            </div>
          ) : null}

          {activeTab === 'security' ? (
            <div className="grid gap-6 xl:grid-cols-2">
              <Panel title="Login Credentials">
                <div className="space-y-4">
                  <label className="block">
                    <span className={labelClass}>Login Email</span>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                      <input
                        type="email"
                        value={accountForm.loginEmail}
                        onChange={(event) => setAccountForm((current) => ({ ...current, loginEmail: event.target.value }))}
                        className={`${inputClass} pl-12`}
                        placeholder="admin@connektly.in"
                      />
                    </div>
                  </label>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className={labelClass}>New Password</span>
                      <input
                        type="password"
                        value={accountForm.newPassword}
                        onChange={(event) => setAccountForm((current) => ({ ...current, newPassword: event.target.value }))}
                        className={inputClass}
                        placeholder="Leave blank to keep current"
                      />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Confirm Password</span>
                      <input
                        type="password"
                        value={accountForm.confirmPassword}
                        onChange={(event) => setAccountForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                        className={inputClass}
                        placeholder="Confirm new password"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void saveAccount()}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#4c38e0] disabled:opacity-60"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
                    Save Login
                  </button>
                </div>
              </Panel>

              <Panel title="Account Security">
                <div className="space-y-3">
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex items-start gap-3">
                      <Mail className="mt-0.5 h-5 w-5 text-gray-400" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-950">{settings.profile.loginEmail || 'No login email'}</p>
                        <p className="mt-1 text-sm text-gray-500">
                          Confirmed {formatDateTime(settings.security.emailConfirmedAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Last Sign In</p>
                      <p className="mt-2 text-sm font-semibold text-gray-950">{formatDateTime(settings.security.lastSignInAt)}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Account Created</p>
                      <p className="mt-2 text-sm font-semibold text-gray-950">{formatDateTime(settings.security.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-950">Auth State</p>
                      <p className="mt-1 text-sm text-gray-500">Supabase owner account</p>
                    </div>
                    <StatusBadge
                      status={settings.security.isBanned ? 'banned' : 'active'}
                      severity={settings.security.isBanned ? 'critical' : 'success'}
                    />
                  </div>
                </div>
              </Panel>

              <Panel title="Dashboard Access">
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Role</p>
                      <p className="mt-2 text-lg font-bold text-gray-950">{labelize(settings.access.role)}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Primary Owner</p>
                      <p className="mt-2 truncate text-lg font-bold text-gray-950">{settings.access.primaryOwnerEmail}</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Enabled Features</p>
                    <p className="mt-2 text-sm font-semibold text-gray-950">
                      {settings.access.isPrimaryOwner ? 'All dashboard features' : `${settings.access.permissions.length} selected features`}
                    </p>
                  </div>
                  <Link
                    to="/dashboard/audit"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#111827] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1f2937]"
                  >
                    <LockKeyhole className="h-4 w-4" />
                    View Audit Trail
                  </Link>
                </div>
              </Panel>
            </div>
          ) : null}

          {activeTab === 'users' ? (
            settings.access.canManageAdmins ? (
              <div className="space-y-6">
                <Panel title="Invite Dashboard Admin" description="Invite organization users and choose which admin dashboard features they can access.">
                  {organizationUsers.length ? (
                    <label className="mb-4 block">
                      <span className={labelClass}>Choose Existing Organization User</span>
                      <select value="" onChange={(event) => useOrganizationUserForInvite(event.target.value)} className={inputClass}>
                        <option value="">Select a user to prefill invite details</option>
                        {organizationUsers.map((user) => (
                          <option key={user.userId} value={user.userId}>
                            {user.fullName} - {user.email}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <div className="grid gap-4 lg:grid-cols-3">
                    <label className="block">
                      <span className={labelClass}>Email</span>
                      <input
                        type="email"
                        value={inviteForm.email}
                        onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))}
                        className={inputClass}
                        placeholder="teammate@connektly.in"
                      />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Full Name</span>
                      <input
                        value={inviteForm.fullName}
                        onChange={(event) => setInviteForm((current) => ({ ...current, fullName: event.target.value }))}
                        className={inputClass}
                        placeholder="Team member"
                      />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Role Title</span>
                      <input
                        value={inviteForm.roleTitle}
                        onChange={(event) => setInviteForm((current) => ({ ...current, roleTitle: event.target.value }))}
                        className={inputClass}
                        placeholder="Support Admin"
                      />
                    </label>
                  </div>
                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {(adminUsers?.permissions || []).map((permission) => (
                      <ToggleRow
                        key={permission.key}
                        title={permission.label}
                        description={permission.description}
                        checked={inviteForm.permissions.includes(permission.key)}
                        onChange={(checked) => toggleInvitePermission(permission.key, checked)}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={adminActionId === 'invite'}
                    onClick={() => void inviteAdmin()}
                    className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#4c38e0] disabled:opacity-60"
                  >
                    {adminActionId === 'invite' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Send Invite
                  </button>
                </Panel>

                <Panel title="Dashboard Admins" description="Primary owner has full access. Other admins only see the features selected here.">
                  <div className="space-y-4">
                    {(adminUsers?.admins || []).map((admin) => (
                      <div key={admin.id} className="rounded-[24px] border border-gray-200 bg-gray-50 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-bold text-gray-950">{admin.fullName}</h3>
                              <StatusBadge
                                status={admin.isPrimaryOwner ? 'primary owner' : admin.status}
                                severity={admin.status === 'disabled' ? 'critical' : admin.status === 'invited' ? 'warning' : 'success'}
                              />
                            </div>
                            <p className="mt-1 text-sm text-gray-500">{admin.email}</p>
                            <p className="mt-1 text-xs text-gray-400">Last sign in {formatDateTime(admin.lastSignInAt)}</p>
                          </div>
                          {!admin.isPrimaryOwner ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={adminActionId === admin.id}
                                onClick={() => void saveAdminAccess(admin.id)}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#111827] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                              >
                                {adminActionId === admin.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                Save
                              </button>
                              <button
                                type="button"
                                disabled={adminActionId === admin.id}
                                onClick={() => void removeAdminAccess(admin.id)}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 disabled:opacity-60"
                              >
                                <Trash2 className="h-4 w-4" />
                                Remove
                              </button>
                            </div>
                          ) : null}
                        </div>

                        {!admin.isPrimaryOwner ? (
                          <>
                            <div className="mt-4 grid gap-4 lg:grid-cols-3">
                              <label className="block">
                                <span className={labelClass}>Full Name</span>
                                <input
                                  value={admin.fullName}
                                  onChange={(event) =>
                                    setAdminUsers((current) =>
                                      current
                                        ? {
                                            ...current,
                                            admins: current.admins.map((item) =>
                                              item.id === admin.id ? { ...item, fullName: event.target.value } : item,
                                            ),
                                          }
                                        : current,
                                    )
                                  }
                                  className={inputClass}
                                />
                              </label>
                              <label className="block">
                                <span className={labelClass}>Role Title</span>
                                <input
                                  value={admin.roleTitle}
                                  onChange={(event) =>
                                    setAdminUsers((current) =>
                                      current
                                        ? {
                                            ...current,
                                            admins: current.admins.map((item) =>
                                              item.id === admin.id ? { ...item, roleTitle: event.target.value } : item,
                                            ),
                                          }
                                        : current,
                                    )
                                  }
                                  className={inputClass}
                                />
                              </label>
                              <label className="block">
                                <span className={labelClass}>Status</span>
                                <select
                                  value={admin.status}
                                  onChange={(event) =>
                                    setAdminUsers((current) =>
                                      current
                                        ? {
                                            ...current,
                                            admins: current.admins.map((item) =>
                                              item.id === admin.id
                                                ? { ...item, status: event.target.value as 'active' | 'invited' | 'disabled' }
                                                : item,
                                            ),
                                          }
                                        : current,
                                    )
                                  }
                                  className={inputClass}
                                >
                                  <option value="active">Active</option>
                                  <option value="invited">Invited</option>
                                  <option value="disabled">Disabled</option>
                                </select>
                              </label>
                            </div>
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                              {(adminUsers?.permissions || []).map((permission) => (
                                <ToggleRow
                                  key={permission.key}
                                  title={permission.label}
                                  description={permission.description}
                                  checked={admin.permissions.includes(permission.key)}
                                  onChange={(checked) => toggleAdminPermission(admin.id, permission.key, checked)}
                                />
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                            <ShieldCheck className="h-4 w-4" />
                            Full access to every dashboard feature
                          </div>
                        )}
                      </div>
                    ))}
                    {adminUsers?.warning ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{adminUsers.warning}</div> : null}
                  </div>
                </Panel>
              </div>
            ) : (
              <Panel title="User Management">
                <div className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <XCircle className="mt-0.5 h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-semibold text-gray-950">Primary owner access required</p>
                    <p className="mt-1 text-sm leading-6 text-gray-500">
                      Only {settings.access.primaryOwnerEmail} can invite dashboard admins and assign feature access.
                    </p>
                  </div>
                </div>
              </Panel>
            )
          ) : null}

          {activeTab === 'notifications' ? (
            <Panel
              title="Notification Preferences"
              action={
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void saveSettings({ notifications: form.notifications }, 'Notification preferences saved.')}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5b45ff] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#4c38e0] disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Preferences
                </button>
              }
            >
              <div className="grid gap-3 xl:grid-cols-2">
                <ToggleRow
                  title="Live event sound"
                  description="Play a sound when new live dashboard events arrive."
                  checked={form.notifications.liveEventSound}
                  onChange={(checked) => updateNotification('liveEventSound', checked)}
                />
                <ToggleRow
                  title="Critical webhook alerts"
                  description="Highlight failed or delayed webhook events."
                  checked={form.notifications.criticalWebhookAlerts}
                  onChange={(checked) => updateNotification('criticalWebhookAlerts', checked)}
                />
                <ToggleRow
                  title="Billing alerts"
                  description="Notify the owner when payment or credit events need review."
                  checked={form.notifications.billingAlerts}
                  onChange={(checked) => updateNotification('billingAlerts', checked)}
                />
                <ToggleRow
                  title="Server alerts"
                  description="Notify the owner when server health changes."
                  checked={form.notifications.serverAlerts}
                  onChange={(checked) => updateNotification('serverAlerts', checked)}
                />
                <ToggleRow
                  title="Weekly operations digest"
                  description="Send a weekly summary of user, payment, and webhook activity."
                  checked={form.notifications.weeklyOpsDigest}
                  onChange={(checked) => updateNotification('weeklyOpsDigest', checked)}
                />
              </div>
            </Panel>
          ) : null}

        </div>
      </div>
    </div>
  );
}
