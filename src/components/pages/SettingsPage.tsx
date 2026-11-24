import React, { useEffect, useRef, useState } from 'react';
import { DatabaseBackup, Download, FileArchive, LogOut, Save, Upload, UserCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { AccountingDB, Lang, PageId, StaffAccount, StaffRole, WorkspaceInvite } from '../../types/accounting';
import { bi, tKey } from '../../i18n/translations';
import { parseBackupJson } from '../../utils/backup';
import { ConfirmConfig, Panel, btnDangerCls, btnPrimaryCls, btnSecondaryCls, inputCls, labelCls } from '../AccountingUI';
import { GoogleInvitesPanel } from './GoogleInvitesPanel';
import { StaffAccountsPanel } from './StaffAccountsPanel';

interface SettingsPageProps {
  db: AccountingDB;
  lang: Lang;
  legacyLocalData: AccountingDB | null;
  staffAccounts: StaffAccount[];
  workspaceInvites: WorkspaceInvite[];
  onUpdateRate: (rate: number) => Promise<void>;
  onImportBackup: (data: AccountingDB) => Promise<void>;
  onMigrateLegacy: () => Promise<void>;
  onCreateStaffAccount: (input: {
    username: string;
    password: string;
    displayName: string;
    role: StaffRole;
    permissions: PageId[];
    employeeId?: number;
  }) => Promise<void>;
  onUpdateStaffAccount: (
    staffUid: string,
    patch: {
      displayName: string;
      role: StaffRole;
      active: boolean;
      permissions: PageId[];
      employeeId?: number;
    }
  ) => Promise<void>;
  onDeleteStaffAccount: (staffUid: string) => Promise<void>;
  onCreateWorkspaceInvite: (input: {
    email: string;
    displayName: string;
    role: StaffRole;
    permissions: PageId[];
  }) => Promise<void>;
  onUpdateWorkspaceInvite: (
    inviteId: string,
    patch: {
      displayName: string;
      role: StaffRole;
      active: boolean;
      permissions: PageId[];
    }
  ) => Promise<void>;
  onDeleteWorkspaceInvite: (inviteId: string) => Promise<void>;
  onToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
  onConfirm: (cfg: ConfirmConfig) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  db,
  lang,
  legacyLocalData,
  staffAccounts,
  workspaceInvites,
  onUpdateRate,
  onImportBackup,
  onMigrateLegacy,
  onCreateStaffAccount,
  onUpdateStaffAccount,
  onDeleteStaffAccount,
  onCreateWorkspaceInvite,
  onUpdateWorkspaceInvite,
  onDeleteWorkspaceInvite,
  onToast,
  onConfirm,
}) => {
  const { user, profile, logout } = useAuth();
  const [rateVal, setRateVal] = useState(String(db.rate || 3.75));
  const [savingRate, setSavingRate] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setRateVal(String(db.rate || 3.75));
  }, [db.rate]);

  const handleSaveRate = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(rateVal);
    if (!(num > 0 && num <= 1000)) {
      onToast(bi(lang, 'أدخل سعر صرف صالح أكبر من 0', 'Enter a valid positive FX rate'), 'error');
      return;
    }
    setSavingRate(true);
    try {
      await onUpdateRate(num);
      onToast(bi(lang, 'تم حفظ الإعدادات وسعر الصرف', 'Settings & FX rate saved'));
    } finally {
      setSavingRate(false);
    }
  };

  const handleExportBackup = () => {
    const json = JSON.stringify(db, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `best-united-accounting-1448-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    onToast(bi(lang, 'تم تصدير النسخة الاحتياطية بنجاح', 'Backup exported successfully'));
  };

  const handleDownloadFullProject = async () => {
    if (!user) return;
    setDownloadingZip(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/project/download-zip', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BEST_UNITED_1448_Project_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      onToast(bi(lang, 'تم تحميل ملف المشروع كاملاً (.zip) بنجاح', 'Complete project ZIP downloaded'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : bi(lang, 'تعذر تحميل ملف المشروع', 'Failed to download project');
      onToast(msg, 'error');
    } finally {
      setDownloadingZip(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseBackupJson(String(reader.result || ''));
      e.target.value = '';
      if (!parsed.data) {
        onToast(bi(lang, 'ملف النسخة الاحتياطية غير صالح', 'Invalid backup JSON file'), 'error');
        return;
      }
      const backupData = parsed.data;
      onConfirm({
        title: bi(lang, 'استرداد نسخة احتياطية', 'Restore Backup'),
        message: parsed.summaryText(lang),
        danger: true,
        onConfirm: async () => {
          await onImportBackup(backupData);
          onToast(bi(lang, 'تم استرداد النسخة الاحتياطية بنجاح', 'Backup restored successfully'));
        },
      });
    };
    reader.readAsText(file);
  };

  const handleMigrate = async () => {
    if (!legacyLocalData) return;
    onConfirm({
      title: bi(lang, 'ترحيل البيانات المحلية', 'Migrate Local Browser Data'),
      message: bi(
        lang,
        'سيتم دمج ورفع السجلات المحفوظة سابقاً في المتصفح إلى حسابك السحابي. هل تريد المتابعة؟',
        'Upload previously saved browser records into your cloud account?'
      ),
      onConfirm: async () => {
        setMigrating(true);
        try {
          await onMigrateLegacy();
          onToast(bi(lang, 'تم ترحيل البيانات المحلية إلى السحابة بنجاح', 'Local data migrated to cloud'));
        } finally {
          setMigrating(false);
        }
      },
    });
  };

  return (
    <div className="space-y-5">
      <Panel title={tKey(lang, 'setTitle')}>
        <div className="mb-5 p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-slate-700 leading-relaxed">
          {tKey(lang, 'offlineNotice')}
        </div>

        <form onSubmit={handleSaveRate} className="max-w-md space-y-3 mb-6">
          <div>
            <label className={labelCls}>{tKey(lang, 'lblDefaultRate')}</label>
            <div className="flex items-center gap-2.5">
              <input
                type="number"
                step="0.01"
                min={0.1}
                required
                value={rateVal}
                onChange={(e) => setRateVal(e.target.value)}
                className={`${inputCls} font-mono-num`}
              />
              <button type="submit" disabled={savingRate} className={btnPrimaryCls}>
                <Save className="w-3.5 h-3.5" />
                <span>{tKey(lang, 'btnSaveSet')}</span>
              </button>
            </div>
          </div>
        </form>

        <div className="pt-5 border-t border-slate-200 flex flex-wrap items-center gap-3">
          <button type="button" onClick={handleExportBackup} className={btnPrimaryCls}>
            <Download className="w-3.5 h-3.5" />
            <span>{tKey(lang, 'btnExpBackup')}</span>
          </button>

          <button
            type="button"
            disabled={downloadingZip}
            onClick={() => void handleDownloadFullProject()}
            className="inline-flex items-center justify-center gap-1.5 px-4 h-9 rounded-xl bg-[#0f766e] hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap"
          >
            <FileArchive className="w-3.5 h-3.5" />
            <span>
              {downloadingZip
                ? bi(lang, 'جاري ضغط المشروع...', 'Packaging ZIP...')
                : bi(lang, 'تحميل المشروع كاملاً (.zip)', 'Download Full Project (.zip)')}
            </span>
          </button>

          <button type="button" onClick={() => fileRef.current?.click()} className={btnSecondaryCls}>
            <Upload className="w-3.5 h-3.5" />
            <span>{tKey(lang, 'btnImpBackup')}</span>
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFileChange} />

          {legacyLocalData && (
            <button type="button" disabled={migrating} onClick={handleMigrate} className={btnSecondaryCls}>
              <DatabaseBackup className="w-3.5 h-3.5" />
              <span>
                {migrating
                  ? bi(lang, 'جاري الترحيل...', 'Migrating...')
                  : bi(lang, 'ترحيل بيانات المتصفح السابقة', 'Migrate Local Browser Data')}
              </span>
            </button>
          )}
        </div>
      </Panel>

      {/* Account Session Panel */}
      <Panel title={bi(lang, 'حساب المستخدم والجلسة', 'User Account & Session')}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {profile?.photoURL ? (
              <img
                src={profile.photoURL}
                alt={profile.displayName}
                className="w-11 h-11 rounded-full object-cover border border-slate-200"
              />
            ) : (
              <div className="w-11 h-11 rounded-full bg-blue-50 text-[#1d4ed8] flex items-center justify-center">
                <UserCheck className="w-5 h-5" />
              </div>
            )}
            <div>
              <div className="text-sm font-bold text-slate-900">{profile?.displayName || user?.displayName}</div>
              <div className="text-xs text-slate-500 font-mono-num">{user?.email}</div>
            </div>
          </div>

          <button type="button" onClick={() => void logout()} className={btnDangerCls}>
            <LogOut className="w-3.5 h-3.5" />
            <span>{tKey(lang, 'logout')}</span>
          </button>
        </div>
      </Panel>

      {/* Employee Username & Password Accounts */}
      <StaffAccountsPanel
        lang={lang}
        employees={db.employees}
        staffAccounts={staffAccounts}
        onCreateStaffAccount={onCreateStaffAccount}
        onUpdateStaffAccount={onUpdateStaffAccount}
        onDeleteStaffAccount={onDeleteStaffAccount}
        onToast={onToast}
        onConfirm={onConfirm}
      />

      {/* Google Email Workspace Sharing */}
      <GoogleInvitesPanel
        lang={lang}
        workspaceInvites={workspaceInvites}
        onCreateInvite={onCreateWorkspaceInvite}
        onUpdateInvite={onUpdateWorkspaceInvite}
        onDeleteInvite={onDeleteWorkspaceInvite}
        onToast={onToast}
        onConfirm={onConfirm}
      />
    </div>
  );
};
