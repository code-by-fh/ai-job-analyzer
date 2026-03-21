"use client";
import { useEffect, useState } from 'react';
import { useAuth, fetchWithAuth } from '../components/AuthProvider';
import PasswordInput from '../components/PasswordInput';
import PageWrapper from '../components/PageWrapper';
import PageHeader from '../components/PageHeader';
import { useLanguage } from '../components/LanguageProvider';
import { useNotification } from '../components/NotificationProvider';
import { logger } from '../lib/logger';
import { Bell, Globe, Smartphone, Mail, Save, CheckCircle2, ShieldAlert, Clock, Info, ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import TemplateManager from '../components/TemplateManager';

function SettingsCard({ title, subtitle, icon, children, footer, className = "" }: {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`relative z-10 bg-white dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-2xl border border-slate-200 dark:border-slate-800 ${className}`}>
      <div className="flex items-center gap-3 mb-6">
        {icon && <div className="text-indigo-500">{icon}</div>}
        <div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-4">
        {children}
      </div>
      {footer && (
        <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
          {footer}
        </div>
      )}
    </section>
  );
}

export default function Settings() {
  const { user, token } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { showError } = useNotification();

  const [uiLanguage, setUiLanguage] = useState<'de' | 'en'>('de');
  const [timezone, setTimezone] = useState('Europe/Berlin');
  const [tzStatus, setTzStatus] = useState('');

  useEffect(() => { setUiLanguage(language); }, [language]);

  const handleLanguageChange = async (lang: 'de' | 'en') => {
    setUiLanguage(lang);
    setLanguage(lang);
  };

  const handleTimezoneChange = async (tz: string) => {
    setTimezone(tz);
    setTzStatus(t('timezoneSaving'));
    try {
      await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/timezone-preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: tz }),
      });
      setTzStatus(t('timezoneSaved'));
      setTimeout(() => setTzStatus(''), 2500);
    } catch {
      setTzStatus(t('timezoneError'));
    }
  };

  type AdapterKey = 'pushover' | 'resend' | 'mailjet' | 'smtp';
  type AdapterStatus = 'idle' | 'saving' | 'saved' | 'error';

  const [formData, setFormData] = useState({
    pushover_user_key: '',
    pushover_api_token: '',
    resend_api_key: '',
    resend_from_email: '',
    mailjet_api_key: '',
    mailjet_secret_key: '',
    mailjet_from_email: '',
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_password: '',
    smtp_from_email: '',
  });
  const [savedData, setSavedData] = useState({
    pushover_user_key: '',
    pushover_api_token: '',
    resend_api_key: '',
    resend_from_email: '',
    mailjet_api_key: '',
    mailjet_secret_key: '',
    mailjet_from_email: '',
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_password: '',
    smtp_from_email: '',
  });
  const [adapterStatus, setAdapterStatus] = useState<Record<AdapterKey, AdapterStatus>>({
    pushover: 'idle', resend: 'idle', mailjet: 'idle', smtp: 'idle',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/settings-view`)
        .then(res => res.json())
        .then(data => {
          const profileData = data.profile || {};
          const loadedData = {
            pushover_user_key: profileData.pushover_user_key || '',
            pushover_api_token: profileData.pushover_api_token || '',
            resend_api_key: profileData.resend_api_key || '',
            resend_from_email: profileData.resend_from_email || '',
            mailjet_api_key: profileData.mailjet_api_key || '',
            mailjet_secret_key: profileData.mailjet_secret_key || '',
            mailjet_from_email: profileData.mailjet_from_email || '',
            smtp_host: profileData.smtp_host || '',
            smtp_port: profileData.smtp_port ? String(profileData.smtp_port) : '587',
            smtp_user: profileData.smtp_user || '',
            smtp_password: profileData.smtp_password || '',
            smtp_from_email: profileData.smtp_from_email || '',
          };
          setFormData(loadedData);
          setSavedData(loadedData);
          if (profileData.timezone) setTimezone(profileData.timezone);
          setLoading(false);
        })
        .catch(e => { logger.error({ err: e }, "Settings load error"); showError(`GET /settings-view fehlgeschlagen: ${e?.message || e}`); setLoading(false); });
    }
  }, [token]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSaveAdapter = async (adapter: AdapterKey) => {
    setAdapterStatus(prev => ({ ...prev, [adapter]: 'saving' }));
    try {
      await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/notification-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          smtp_port: formData.smtp_port ? parseInt(formData.smtp_port, 10) : 587,
        }),
      });
      setSavedData(formData);
      setAdapterStatus(prev => ({ ...prev, [adapter]: 'saved' }));
      setTimeout(() => setAdapterStatus(prev => ({ ...prev, [adapter]: 'idle' })), 2500);
    } catch (e: any) {
      showError(e?.message || t('error'));
      setAdapterStatus(prev => ({ ...prev, [adapter]: 'error' }));
      setTimeout(() => setAdapterStatus(prev => ({ ...prev, [adapter]: 'idle' })), 3000);
    }
  };

  const AdapterFooter = ({ adapter, label }: { adapter: AdapterKey; label: string }) => {
    const s = adapterStatus[adapter];
    return (
      <div className="flex items-center justify-between gap-4">
        <div>
          {s === 'saved' && (
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-sm font-bold">
              <CheckCircle2 className="w-4 h-4" />{t('saved')}
            </span>
          )}
          {s === 'saving' && <span className="text-indigo-500 text-sm font-bold animate-pulse">{t('saving')}...</span>}
          {s === 'error' && (
            <span className="flex items-center gap-1.5 text-rose-500 text-sm font-bold">
              <ShieldAlert className="w-4 h-4" />{t('error')}
            </span>
          )}
        </div>
    <button
      onClick={() => handleSaveAdapter(adapter)}
      disabled={s === 'saving'}
      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/20 transition-all cursor-pointer active:scale-95"
    >
      <Save className="w-4 h-4" />{label}
    </button>
      </div>
    );
  };

  const ActiveBadge = ({ active }: { active: boolean }) => active ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 uppercase tracking-wider">
      <CheckCircle2 className="w-3.5 h-3.5" />
      {t('active')}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 uppercase tracking-wider">
      {t('inactive')}
    </span>
  );

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
          <p className="text-slate-500 dark:text-slate-400 font-medium">{t('loading')}...</p>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <PageHeader title={t('settings') || 'Settings'} subtitle={t('notificationsSubtitle')} />

      <SettingsCard
          title={t('languagePreference')}
          icon={<Globe className="w-5 h-5" />}
      >
        <div className="flex gap-3">
          {(['de', 'en'] as const).map(lang => (
            <button
              key={lang}
              onClick={() => handleLanguageChange(lang)}
              className={`px-6 py-2.5 rounded-xl font-semibold transition-all cursor-pointer ${uiLanguage === lang
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
            >
              {lang === 'de' ? t('german') : t('english')}
            </button>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard
        title={t('timezonePreference')}
        icon={<Clock className="w-5 h-5" />}
      >
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('timezoneDescription')}</p>
        <div className="flex items-center gap-3">
          <select
            value={timezone}
            onChange={e => handleTimezoneChange(e.target.value)}
            className="flex-1 bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
          >
            <optgroup label="Europe">
              <option value="Europe/Berlin">Europe/Berlin</option>
              <option value="Europe/Vienna">Europe/Vienna</option>
              <option value="Europe/Zurich">Europe/Zurich</option>
              <option value="Europe/London">Europe/London</option>
              <option value="Europe/Paris">Europe/Paris</option>
              <option value="Europe/Amsterdam">Europe/Amsterdam</option>
              <option value="Europe/Brussels">Europe/Brussels</option>
              <option value="Europe/Warsaw">Europe/Warsaw</option>
              <option value="Europe/Prague">Europe/Prague</option>
              <option value="Europe/Budapest">Europe/Budapest</option>
              <option value="Europe/Rome">Europe/Rome</option>
              <option value="Europe/Madrid">Europe/Madrid</option>
              <option value="Europe/Stockholm">Europe/Stockholm</option>
              <option value="Europe/Helsinki">Europe/Helsinki</option>
              <option value="Europe/Bucharest">Europe/Bucharest</option>
              <option value="Europe/Athens">Europe/Athens</option>
              <option value="Europe/Moscow">Europe/Moscow</option>
            </optgroup>
            <optgroup label="Americas">
              <option value="America/New_York">America/New_York</option>
              <option value="America/Chicago">America/Chicago</option>
              <option value="America/Denver">America/Denver</option>
              <option value="America/Los_Angeles">America/Los_Angeles</option>
              <option value="America/Toronto">America/Toronto</option>
              <option value="America/Sao_Paulo">America/Sao_Paulo</option>
            </optgroup>
            <optgroup label="Asia / Pacific">
              <option value="Asia/Dubai">Asia/Dubai</option>
              <option value="Asia/Kolkata">Asia/Kolkata</option>
              <option value="Asia/Singapore">Asia/Singapore</option>
              <option value="Asia/Tokyo">Asia/Tokyo</option>
              <option value="Asia/Shanghai">Asia/Shanghai</option>
              <option value="Australia/Sydney">Australia/Sydney</option>
            </optgroup>
            <optgroup label="UTC">
              <option value="UTC">UTC</option>
            </optgroup>
          </select>
          {tzStatus && (
            <span className={`text-sm font-semibold whitespace-nowrap ${tzStatus === t('timezoneSaved') ? 'text-emerald-600 dark:text-emerald-400' : tzStatus === t('timezoneError') ? 'text-rose-500' : 'text-indigo-500 animate-pulse'}`}>
              {tzStatus}
            </span>
          )}
        </div>
      </SettingsCard>

      {/* Notifications Header */}
      <div className="flex items-center gap-3 px-1 pt-4">
        <div className="text-indigo-500">
          <Bell className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white uppercase tracking-wider">{t('notifications')}</h2>
        </div>
      </div>

      <div className="p-4 bg-indigo-50/40 dark:bg-indigo-500/5 rounded-xl border border-indigo-100/60 dark:border-indigo-500/10 flex gap-3">
        <div className="p-2 bg-white dark:bg-slate-800 rounded-lg h-fit shadow-sm shrink-0">
          <Info className="w-3.5 h-3.5 text-indigo-500" />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{t('notificationAdapterInfo')}</p>
      </div>

      {/* PUSHOVER */}
      <SettingsCard
        title="Pushover"
        subtitle={t('pushNotifications')}
        icon={<Smartphone className="w-5 h-5 text-sky-500" />}
        footer={<AdapterFooter adapter="pushover" label={t('pushoverSave')} />}
      >
        <div className="flex justify-end mb-6 -mt-2">
          <ActiveBadge active={!!(savedData.pushover_user_key && savedData.pushover_api_token)} />
        </div>
        <div className="p-4 bg-sky-50/50 dark:bg-sky-500/5 border border-sky-100 dark:border-sky-500/10 rounded-2xl flex items-center justify-between mb-6">
          <span className="text-xs text-sky-800/80 dark:text-sky-300/60 font-medium">{t('pushoverKeysInfo')}</span>
          <a href="https://pushover.net/" target="_blank" rel="noopener noreferrer" className="p-2 bg-white dark:bg-slate-800 rounded-lg text-sky-600 hover:text-sky-700 transition shadow-sm border border-sky-100/50 dark:border-sky-800">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">{t('userKey')}</label>
            <PasswordInput name="pushover_user_key" value={formData.pushover_user_key} onChange={handleChange} className="font-mono text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">{t('apiToken')}</label>
            <PasswordInput name="pushover_api_token" value={formData.pushover_api_token} onChange={handleChange} className="font-mono text-sm" />
          </div>
        </div>
      </SettingsCard>

      {/* RESEND */}
      <SettingsCard
        title="Resend"
        subtitle={t('emailNotifications')}
        icon={<Mail className="w-5 h-5 text-violet-500" />}
        footer={<AdapterFooter adapter="resend" label={t('resendSave')} />}
      >
        <div className="flex justify-end mb-6 -mt-2">
          <ActiveBadge active={!!(savedData.resend_api_key && savedData.resend_from_email)} />
        </div>
        <div className="rounded-2xl border border-violet-100 dark:border-violet-900/40 overflow-hidden mb-6">
          <div className="px-4 py-3 bg-violet-50 dark:bg-violet-500/5 flex items-center justify-between">
            <span className="text-xs font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wide">{t('resendSetupGuide')}</span>
            <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:underline">
              resend.com <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <ol className="px-4 py-3 space-y-2.5 bg-white dark:bg-slate-900/30">
            {[t('resendStep1'), t('resendStep2'), t('resendStep3'), t('resendStep4'), t('resendStep5')].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 text-[10px] font-black flex items-center justify-center mt-0.5">{i + 1}</span>
                <span className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">{t('resendApiKey')}</label>
            <PasswordInput name="resend_api_key" value={formData.resend_api_key} onChange={handleChange} className="font-mono text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">{t('resendFromEmail')}</label>
            <input type="email" name="resend_from_email" value={formData.resend_from_email} onChange={handleChange} placeholder="noreply@yourdomain.com"
              className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono" />
          </div>
        </div>
      </SettingsCard>

      {/* MAILJET */}
      <SettingsCard
        title="Mailjet"
        subtitle={t('emailNotifications')}
        icon={<Mail className="w-5 h-5 text-orange-500" />}
        footer={<AdapterFooter adapter="mailjet" label={t('mailjetSave')} />}
      >
        <div className="flex justify-end mb-6 -mt-2">
          <ActiveBadge active={!!(savedData.mailjet_api_key && savedData.mailjet_secret_key && savedData.mailjet_from_email)} />
        </div>
        <div className="rounded-2xl border border-orange-100 dark:border-orange-900/40 overflow-hidden mb-6">
          <div className="px-4 py-3 bg-orange-50 dark:bg-orange-500/5 flex items-center justify-between">
            <span className="text-xs font-bold text-orange-700 dark:text-orange-400 uppercase tracking-wide">{t('mailjetSetupGuide')}</span>
            <a href="https://app.mailjet.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 hover:underline">
              mailjet.com <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <ol className="px-4 py-3 space-y-2.5 bg-white dark:bg-slate-900/30">
            {[t('mailjetStep1'), t('mailjetStep2'), t('mailjetStep3'), t('mailjetStep4'), t('mailjetStep5')].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 text-[10px] font-black flex items-center justify-center mt-0.5">{i + 1}</span>
                <span className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">{t('mailjetApiKey')}</label>
            <PasswordInput name="mailjet_api_key" value={formData.mailjet_api_key} onChange={handleChange} className="font-mono text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">{t('mailjetSecretKey')}</label>
            <PasswordInput name="mailjet_secret_key" value={formData.mailjet_secret_key} onChange={handleChange} className="font-mono text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">{t('mailjetFromEmail')}</label>
            <input type="email" name="mailjet_from_email" value={formData.mailjet_from_email} onChange={handleChange} placeholder="noreply@yourdomain.com"
              className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono" />
          </div>
        </div>
      </SettingsCard>

      {/* SMTP */}
      <SettingsCard
        title="SMTP"
        subtitle={t('smtpEmailNotifications')}
        icon={<Mail className="w-5 h-5 text-teal-500" />}
        footer={<AdapterFooter adapter="smtp" label={t('smtpSave')} />}
      >
        <div className="flex justify-end mb-6 -mt-2">
          <ActiveBadge active={!!(savedData.smtp_host && savedData.smtp_user && savedData.smtp_password)} />
        </div>
        <div className="rounded-2xl border border-teal-100 dark:border-teal-900/40 overflow-hidden mb-6">
          <div className="px-4 py-3 bg-teal-50 dark:bg-teal-500/5">
            <span className="text-xs font-bold text-teal-700 dark:text-teal-400 uppercase tracking-wide">{t('smtpSetupTitle')}</span>
          </div>
          <div className="px-4 py-3 bg-white dark:bg-slate-900/30 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {([
                { name: 'Gmail', host: 'smtp.gmail.com', note: language === 'de' ? 'App-Passwort erforderlich — direkt erstellen:' : 'App password required — create here:', appPasswordUrl: 'https://myaccount.google.com/apppasswords', appPasswordLabel: language === 'de' ? 'Google App-Passwort erstellen' : 'Create Google App Password', infoUrl: 'https://support.google.com/accounts/answer/185833' },
                { name: 'GMX', host: 'mail.gmx.net', note: language === 'de' ? 'Normales GMX-Passwort. SMTP in den Einstellungen aktivieren:' : 'Normal GMX password. Enable SMTP in settings:', appPasswordUrl: null, appPasswordLabel: null, infoUrl: 'https://hilfe.gmx.net/email/sicherheit/imap.html' },
                { name: 'web.de', host: 'smtp.web.de', note: language === 'de' ? 'Normales web.de-Passwort. SMTP in den Einstellungen aktivieren:' : 'Normal web.de password. Enable SMTP in settings:', appPasswordUrl: null, appPasswordLabel: null, infoUrl: 'https://hilfe.web.de/pop-imap/imap/web-de-konto-im-e-mail-programm-einrichten.html' },
                { name: 'Outlook / Hotmail', host: 'smtp.office365.com', note: language === 'de' ? 'App-Passwort bei aktivierter 2FA erforderlich:' : 'App password required with 2FA enabled:', appPasswordUrl: 'https://account.microsoft.com/security/advanced', appPasswordLabel: language === 'de' ? 'Microsoft App-Passwort erstellen' : 'Create Microsoft App Password', infoUrl: 'https://support.microsoft.com/de-de/account-billing/verwenden-von-app-kennw%C3%B6rtern-mit-apps-die-keine-zweistufige-verifizierung-unterst%C3%BCtzen-5896ed9b-4263-e681-128a-a6f2979a7944' },
                { name: 'Yahoo', host: 'smtp.mail.yahoo.com', note: language === 'de' ? 'App-Passwort erforderlich — direkt erstellen:' : 'App password required — create here:', appPasswordUrl: 'https://login.yahoo.com/myaccount/security/app-passwords/list', appPasswordLabel: language === 'de' ? 'Yahoo App-Passwort erstellen' : 'Create Yahoo App Password', infoUrl: 'https://help.yahoo.com/kb/SLN15241.html' },
                { name: 'T-Online / Telekom', host: 'securesmtp.t-online.de', note: language === 'de' ? 'Normales T-Online-Passwort. Port 587 mit STARTTLS:' : 'Normal T-Online password. Port 587 with STARTTLS:', appPasswordUrl: null, appPasswordLabel: null, infoUrl: 'https://www.telekom.de/hilfe/festnetz-internet-tv/e-mail/e-mail-programm-einrichten/programme-einrichten' },
              ] as const).map(({ name, host, note, appPasswordUrl, appPasswordLabel, infoUrl }) => (
                <button key={name} type="button" onClick={() => setFormData(prev => ({ ...prev, smtp_host: host }))}
                  className={`text-left p-2.5 rounded-xl border transition-all cursor-pointer hover:shadow-sm ${formData.smtp_host === host ? 'bg-teal-50 dark:bg-teal-500/10 border-teal-300 dark:border-teal-700' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 hover:border-teal-200 dark:hover:border-teal-800'}`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <p className={`font-bold text-xs ${formData.smtp_host === host ? 'text-teal-700 dark:text-teal-300' : 'text-slate-800 dark:text-slate-200'}`}>{name}</p>
                    {formData.smtp_host === host && <svg className="w-3 h-3 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"/></svg>}
                  </div>
                  <p className="text-[10px] font-mono text-teal-600 dark:text-teal-400 mb-1">{host}</p>
                  <p className="text-[10px] text-slate-500 leading-relaxed mb-1">{note}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1" onClick={e => e.stopPropagation()}>
                    {appPasswordUrl && appPasswordLabel && (
                      <a href={appPasswordUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-white bg-teal-600 hover:bg-teal-500 px-2 py-0.5 rounded-md transition-colors">
                        {appPasswordLabel}<ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                    <a href={infoUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] font-medium text-teal-600 dark:text-teal-400 hover:underline transition-colors">
                      {language === 'de' ? 'Anleitung' : 'Guide'}<ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed pt-1 border-t border-slate-100 dark:border-slate-800">
              {t('smtpProviderNote')}
            </p>
          </div>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">{t('smtpHost')}</label>
              <input type="text" name="smtp_host" value={formData.smtp_host} onChange={handleChange} placeholder="smtp.gmail.com"
                className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">{t('smtpPort')}</label>
              <input type="number" name="smtp_port" value={formData.smtp_port} onChange={handleChange} placeholder="587"
                className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">{t('smtpUser')}</label>
            <input type="email" name="smtp_user" value={formData.smtp_user} onChange={handleChange} placeholder="deinname@gmail.com"
              className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">{t('smtpPassword')}</label>
            <PasswordInput name="smtp_password" value={formData.smtp_password} onChange={handleChange} className="font-mono text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">{t('smtpFromEmail')}</label>
            <input type="email" name="smtp_from_email" value={formData.smtp_from_email} onChange={handleChange} placeholder={t('smtpFromEmailHint')}
              className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title={t('notificationTemplates')}
        subtitle={t('customTemplates')}
        icon={<Bell className="w-5 h-5" />}
      >
        <TemplateManager isAdmin={!!user?.is_admin} adminMode={false} />
      </SettingsCard>

    </PageWrapper>
  );
}
