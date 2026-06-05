export type Language = "en" | "de";

export const translations = {
  en: {
    // Navigation
    dashboard: "Dashboard",
    listings: "Listings",
    statistics: "Statistics",
    scheduledPlatforms: "Scheduled Platforms",
    settings: "Settings",
    account: "Account",
    userManagement: "User Management",
    applications: "Applications",

    // Dashboard Shell
    collapseSidebar: "Collapse Sidebar",
    expandSidebar: "Expand Sidebar",
    jobAgent: "JobAgent",
    deepIntelligence: "Deep Intelligence",
    more: "More",

    // User Menu
    signOut: "Sign Out",
    profile: "Profile",
    help: "Help",
    signedInAs: "Signed in as",
    member: "Member",
    admin: "Admin",
    adminArea: "Admin Area",

    // Theme Toggler
    switchLight: "Switch to Light Mode",
    switchDark: "Switch to Dark Mode",

    // Language Toggler
    switchLanguage: "Change Language",
    german: "German",
    english: "English",

    // Home Page
    jobIntelligence: "Job Intelligence",
    opportunitiesDetected: "Opportunities detected",
    searchPlaceholder: "Import job by URL...",
    scan: "IMPORT",
    systemWaiting: "System waiting for input.",
    sortBy: "Sort by:",
    relevance: "Relevance",
    newest: "Newest",
    analysis: "Analysis",
    applySource: "Apply Source",
    generateApplication: "Generate Application",
    viewApplication: "View Application",
    failedRetry: "Failed - Retry",
    processing: "Processing...",
    removeFromFavorites: "Remove from favorites",
    addToFavorites: "Add to favorites",
    deleteJob: "Delete job",
    viewDetails: "View Details",
    closeDetails: "Close Details",
    edit: "Edit",
    match: "match",
    deleteConfirm: "Are you sure you want to delete this job?",
    total: "Total",
    statusApplied: "Applied",
    statusInterview: "Interview",
    statusOffer: "Offer",
    statusRejected: "Rejected",
    statusAccepted: "Accepted",
    statusOpen: "Open",
    statusDrafted: "Drafted",
    updateStatus: "Update Status",
    applicationManagement: "Application Management",
    applicationPipeline: "Application Pipeline",
    otherStatus: "Other:",
    alternativePath: "Alternative",

    // Crawl Status
    jobSearch: "Job Search",
    searchingForJobs: "Searching for jobs...",
    jobsFound: "Jobs found",
    jobsSaved: "saved",
    jobsSkipped: "skipped",
    processingJobDetails: "{count} of {total} job details processed",
    loadJobDetails: "Load job details",
    extractingDescriptions: "Extracting job descriptions...",
    aiExtraction: "AI Extraction",
    aiExtractionCount: "{count} of {total} extracted",
    analyzingCount: "{count} of {total} jobs analyzed",
    allJobsAnalyzed: "All jobs successfully analyzed!",
    jobsRatedAndSaved: "{count} {jobs} rated and saved.",
    job: "job",
    jobs: "jobs",
    cancelCrawl: "Cancel crawl",
    cancelCrawlConfirm: "Are you sure you want to cancel this crawl job?",
    jobImportSuccess: "Job successfully imported and analyzed.",
    jobImportAlreadyExists: "This job is already in your list.",
    jobImportFailed: "Could not import the job. Please check the URL.",

    // Application Modal
    applicationPreview: "Application Preview",
    close: "Close",
    copyText: "Copy Text",
    saveAsPdf: "Save as PDF",
    copiedToClipboard: "Copied to clipboard!",
    downloadFailed: "Download failed",
    pdfDownloadError: "Error during PDF download.",

    // Login
    systemAccess: "System Access",
    identity: "Username",
    secureKey: "Password",
    initializeSession: "Login",
    authFailed: "Authentication failed.",
    systemUnreachable: "System unreachable.",

    // Settings
    profileConfiguration: "Profile Configuration",
    profileSubtitle: "Manage your professional identity and search preferences",
    saveChanges: "Save Changes",
    tryAgain: "Try Again",
    notifications: "Notifications",
    generating: "Generating...",
    updated: "Updated!",
    saving: "Saving...",
    saved: "Saved!",
    error: "Error",
    success: "Success",
    analyzingPdf: "Analyzing PDF... (takes 10-20s)",
    uploadFailed: "Upload failed",
    importSuccess: "CV imported successfully!",
    importFailed: "Import failed",
    targetParameters: "Search Criteria",
    targetRole: "Target Role",
    skillsComma: "Skills (Comma sep.)",
    minSalary: "Min Salary",
    location: "Location",
    matchThreshold: "Match Threshold",
    matchThresholdHint:
      "Jobs scoring below this value are archived automatically (0 = off).",
    matchThresholdSaving: "Saving...",
    matchThresholdSaved: "Saved",
    matchThresholdError: "Error",
    preferencesNatural: "Preferences (Natural Language)",
    experience: "Experience",
    keyProjects: "Key Projects",
    education: "Education",
    uploadCv: "Upload CV",
    dropPdf: "Drop your PDF to auto-extract skills and experience.",
    selectPdf: "Select PDF",
    analyzing: "Analyzing...",
    security: "Security",
    dangerZone: "Danger Zone",
    deleteAllJobs: "Delete All Jobs",
    deleteProfileOnly: "Delete Profile Only",
    factoryReset: "Factory Reset (All Data)",
    deleteJobsConfirm:
      "Are you sure? This will delete all your crawled jobs permanently.",
    deleteProfileConfirm:
      "Are you sure? This will delete your profile and CV data permanently.",
    factoryResetConfirm:
      "WARNING: This will delete ALL jobs, your entire profile and all notification adapter configs. This cannot be undone.",
    enterPasswordToConfirm: "Enter your password to confirm:",
    incorrectPassword: "Incorrect password",
    loadingProfile: "Loading Profile...",
    startingCrawler: "Starting Crawler...",
    crawlJobsDispatched: "Crawl jobs dispatched!",
    loading: "Loading...",
    dayUnit: "d",
    hourUnit: "h",
    minUnit: "m",
    now: "now",

    // Experience & Projects Fields
    company: "Company",
    role: "Role",
    duration: "Duration",
    description: "Description",
    projectName: "Project Name",
    techStack: "Tech Stack",

    // Admin
    adminControlPanel: "Admin Control Panel",
    createNewUser: "Create New User",
    username: "Username",
    password: "Password",
    createUser: "Create User",
    id: "ID",
    clearance: "Clearance",
    actions: "Actions",
    delete: "Delete",
    areYouCertain: "Are you certain?",
    errorCreatingUser: "Error creating user",
    verifyingClearance: "Verifying Clearance...",

    // Password Change
    currentPassword: "Current Password",
    newPassword: "New Password",
    updatePassword: "Update Password",
    updating: "Updating...",
    passwordUpdated: "Password updated!",
    networkError: "Network Error",

    // Schedule
    scheduleTime: "Scan Time",
    scheduleDays: "Weekdays",
    scheduleLabel: "Schedule",
    noSchedule: "No schedule",
    dayMon: "Mo",
    dayTue: "Tu",
    dayWed: "We",
    dayThu: "Th",
    dayFri: "Fr",
    daySat: "Sa",
    daySun: "Su",

    // Job Platforms
    jobPlatforms: "Job Platforms",
    platformsSubtitle: "Manage URLs and automated scan intervals",
    notificationsSubtitle: "Configure your notification adapters",
    adding: "Adding...",
    platformAdded: "Platform added!",
    crawlInProgress: "Crawl in progress...",
    scanNow: "Scan now",
    remove: "Remove",
    everyHour: "Every Hour",
    every6Hours: "Every 6 Hours",
    every12Hours: "Every 12 Hours",
    every24Hours: "Every 24 Hours",
    everyWeek: "Every Week",
    neverScanned: "Never scanned",
    lastScan: "Last Scan",
    lastScanned: "Last: {date}",
    urlsCached: "URLs cached",
    addPlatformPlaceholder: "Add new platform URL (e.g. LinkedIn, Indeed...)",
    invalidUrl: "Invalid URL format",
    invalidUrlProtocol: "URL must start with http:// or https://",
    platformAlreadyExists: "This URL is already in your platform list.",
    notificationsEnabled: "Notifications Enabled",
    notificationsDisabled: "Notifications Disabled",
    platformActive: "Platform active",
    platformInactive: "Platform inactive",
    deactivated: "Deactivated",

    // Filters
    all: "All",
    favorites: "Favorites",
    noFavorites: "No Favorites",
    listView: "List",
    boardView: "Kanban",
    confirm: "Confirm",
    cancel: "Cancel",

    // Missing keys from reports
    removePlatform: "Remove platform",
    userCreated: "User created!",
    deleteUser: "Delete User",

    // Dynamic List
    addItem: "Add Item",
    noEntries: "No entries yet.",
    removeEntry: "Remove entry",
    completeProfileFirst: "Please complete your profile first.",

    // Job list filters
    filterSearchPlaceholder: "Search by title or company...",
    allDomains: "All domains",
    allPlatforms: "All platforms",
    allStatuses: "All statuses",
    withApplication: "With cover letter",
    clearAllFilters: "Clear all filters",

    // Deletion actions
    alsoDeleteListings: "Also delete all associated listings",
    deleteAllFromPlatform: "Delete all from this platform",
    keepFavorites: "Keep favorites",
    keepApplications: "Keep listings with application",
    select: "Select",
    selected: "Selected",
    selectAllVisible: "Select all visible",
    bulkDelete: "Delete Selected",
    deleteAllFromCompany: "Delete all from {company}",

    // Needs Attention / Follow-up / Prep
    needsAttention: "Needs Attention",
    prepMaterialAvailable: "Prep Material",
    followUpDue: "Follow-up due",

    // Job Details Modal
    overview: "Overview",
    application: "Application",
    interviewPrep: "Interview Prep",
    companyProfile: "Company",
    historyTab: "History",
    noApplication: "No application generated yet",
    jobDescription: "Show job description",

    // Tab Labels
    status: "Status",
    documents: "Documents",
    shortInfo: "Info",
    shortApp: "App",
    shortInt: "Int",
    shortCo: "Co",
    shortStatus: "Status",
    shortDocs: "Docs",

    // Setup Warnings
    setupRequired: "Setup Required",
    profileIncomplete: "Profile Incomplete",
    noNotificationAdapter: "No Notifications",
    completeProfileDesc:
      "Your profile is not fully filled out. Complete it to get better job matches.",
    noNotificationAdapterDesc:
      "You haven't configured any notification services. You won't be notified about new jobs.",
    actionCompleteProfile: "Complete Profile",
    actionConfigureNotifications: "Configure Notifications",
    found: "found",
    new: "new",

    // Dashboard
    dashboardSubtitle: "Your job search overview at a glance",
    dashboardDescription: "Your job search overview and quick actions.",

    // Listings Page
    listingsPageTitle: "Job Listings",
    listingsPageSubtitle: "All your discovered job opportunities",

    // Companies
    companies: "Companies",
    companiesPageTitle: "Company Profiles",
    companiesPageSubtitle:
      "Deep intelligence on all companies in your pipeline",
    companiesDescription:
      "Insights and intelligence about the companies in your pipeline.",

    // Language Preference
    languagePreference: "Language Preference",
    spokenLanguages: "Spoken Languages",
    spokenLanguagesPlaceholder: "e.g. German (native), English (fluent)",

    // Timezone
    timezonePreference: "Timezone",
    timezoneDescription:
      "Used for job platform scheduling. Make sure this matches your local time.",
    timezoneSaved: "Timezone saved",

    // First Run / Manual Analysis
    firstRunNotice:
      "Note: On the first run, no automatic AI analysis is performed.",
    triggerAnalysis: "Trigger AI Analysis",
    analysisTriggered: "AI analysis started",
    timezoneSaving: "Saving...",
    timezoneError: "Error saving timezone",

    // Profile Page
    profileAndResume: "Profile & Resume",
    profileCompletion: "Profile Completion",
    missingFields: "Missing Fields",
    targetJob: "Search Profile",
    resume: "Resume",
    universityPlaceholder: "University, Degree...",
    applicationDocuments: "Application Documents",
    workReferences: "Work References",
    certifications: "Certificates",
    uploadFiles: "Upload Files",
    noWorkReferences: "No work references uploaded yet.",
    noCertificates: "No certificates uploaded yet.",

    // Settings - Notification Adapters
    deliveryMethods: "Delivery Methods",
    notificationAdapterInfo:
      "Configure your notification credentials here. Activating platforms is done individually on the dashboard.",
    active: "Active",
    inactive: "Inactive",
    importantSecurityNote: "Important Security Note",
    pushNotifications: "Push Notifications",
    pushoverKeysInfo: "Get your keys at Pushover.net",
    userKey: "User Key",
    apiToken: "API Token",
    emailNotifications: "Email Notifications",
    resendApiInfo:
      "API key from resend.com. Jobs are sent as a batched digest email.",
    resendSetupGuide: "Setup",
    resendStep1: "Create an account at resend.com (free plan available)",
    resendStep2:
      "Verify your domain: Settings → Domains → Add Domain, then set the DNS records at your domain provider",
    resendStep3: "Create an API key: Settings → API Keys → Create API Key",
    resendStep4:
      "Enter the API key and sender email (e.g. noreply@your-domain.com) below and save",
    resendStep5:
      "On the dashboard: enable the Mail adapter per platform (✉ icon) and enter recipient addresses",
    resendApiKey: "API Key",
    resendFromEmail: "Sender Email",
    resendRecipients: "Recipients (comma-separated)",
    mailjetSetupGuide: "Setup",
    mailjetStep1: "Create an account at mailjet.com (free plan available)",
    mailjetStep2:
      "Verify your sender domain: Sender Domains & Addresses → Add a Domain",
    mailjetStep3:
      "Retrieve API keys: Account → API Key Management → API Key + Secret Key",
    mailjetStep4: "Enter API Key, Secret Key and sender email below and save",
    mailjetStep5:
      "On the dashboard: enable the MJ adapter per platform and enter recipient addresses",
    mailjetApiKey: "API Key",
    mailjetSecretKey: "Secret Key",
    mailjetFromEmail: "Sender Email",
    mailjetRecipients: "Recipients (comma-separated)",
    smtpEmailNotifications: "SMTP · Own Mail Server",
    smtpSetupTitle: "Setup — Common Providers",
    smtpProviderNote:
      "Click a provider to auto-fill the host. All use port 587 with STARTTLS. With 2FA enabled, an app password is usually required.",
    smtpHost: "SMTP Host",
    smtpPort: "Port",
    smtpUser: "Username / Email",
    smtpPassword: "Password / App Password",
    smtpFromEmail: "Sender Email (optional)",
    smtpFromEmailHint: "Leave empty to use the username",
    pushoverSave: "Save Pushover",
    resendSave: "Save Resend",
    mailjetSave: "Save Mailjet",
    smtpSave: "Save SMTP",
    testNotification: "Test",
    testSending: "Sending...",
    testSent: "Sent!",
    testFailed: "Failed",
    testRecipientTitle: "Send Test Notification",
    testRecipientLabel: "Recipient Email",
    testRecipientPlaceholder: "you@example.com",
    sendTest: "Send Test",
    globalEmailSettings: "Global Email Settings",
    globalEmailSettingsSubtitle: "Shared settings for all email adapters",
    globalEmailRecipient: "Global Recipient",
    globalEmailRecipientDesc:
      "This address always receives a notification, regardless of job platform settings",
    saveGlobalEmail: "Save",
    testEmailSend: "Send test email",
    testEmailSending: "Sending...",
    testEmailSent: "Test email sent!",
    notificationTemplates: "Notification Templates",
    customTemplates: "Custom Templates",

    // Archive
    archiveJob: "Archive job",
    archiveConfirm: "Are you sure you want to archive this job?",
    restoreJob: "Restore job",
    archiveSelected: "Archive Selected",
    archiveAllFromCompany: "Archive all from {company}",
    archiveEmpty: "No archived jobs.",
    archivePageTitle: "Archive",
    archivePageSubtitle: "Jobs archived from your listings",
    archiveDescription: "View and restore previously archived job listings.",
    deletePermanent: "Delete permanently",
    deletePermanentConfirm:
      "Are you sure you want to delete this job permanently? Note: If the job platform remains active, this job will be imported again during the next scan.",

    // JobDocumentsTab
    notes: "Notes",
    personalNotesPlaceholder:
      "Job notes, interview notes, personal impressions...",
    savingNotes: "Saving...",
    notesSaved: "Saved",
    tasks: "Tasks",
    noTasks: "No tasks - add one.",
    newTask: "New task...",
    files: "Files",
    fileLimitInfo: "PDF, DOCX, Image - max. 10 MB",
    uploading: "Uploading...",
    dropFileHere: "Drop file here or click",
    loadingFile: "Loading...",
    clickToOpen: "Click to open",
    noFiles: "No files uploaded yet",
    viewFile: "View",
    downloadFile: "Download",
    maxFileSize: "Max. file size 10 MB",
    genericError: "An error occurred",

    // Guidance
    guidanceWhatNow: "What now?",
    guidanceOpenNext: "Check the job and decide if you want to apply.",
    guidanceOpenItem1: "Read AI analysis (Overview tab)",
    guidanceOpenItem2: "Read job description completely",
    guidanceOpenItem3: "Short research on the company",
    guidanceOpenItem4: "Start application draft",
    guidanceOpenNudge: "Every process starts with an honest self-assessment.",

    guidanceDraftedNext: "Review your application draft and send it.",
    guidanceDraftedItem1: "Application draft generated",
    guidanceDraftedItem2: "Check draft for completeness and tone",
    guidanceDraftedItem3: "Personalize cover letter (name, job reference)",
    guidanceDraftedItem4: "Send documents / fill out form",
    guidanceDraftedNudge: "Perfect is the enemy of good — send it now.",

    guidanceAppliedNext: "Document your application and plan your follow-up.",
    guidanceAppliedItem1: "Received or checked application confirmation",
    guidanceAppliedItem2: "Follow-up date set",
    guidanceAppliedItem3: "Interview prep prepared",
    guidanceAppliedItem4: "Patience: feedback time is often 2–4 weeks",
    guidanceAppliedNudge: "You applied — that was the hardest step.",

    guidanceInterviewNext: "Prepare intensively for the interview.",
    guidanceInterviewItem1: "Interview prep material generated",
    guidanceInterviewItem2: "3 own strength examples (STAR method) prepared",
    guidanceInterviewItem3: "Questions for the company prepared",
    guidanceInterviewItem4:
      "Logistics cleared (location, time, contact, video link)",
    guidanceInterviewNudge:
      "Preparation is the difference between luck and skill.",

    guidanceOfferNext: "Analyze the offer carefully before you respond.",
    guidanceOfferItem1: "Check conditions (salary, vacation, remote share)",
    guidanceOfferItem2: "Compared salary benchmark",
    guidanceOfferItem3: "Identified negotiation room",
    guidanceOfferItem4: "Take 48h to think (professional & common)",
    guidanceOfferNudge: "An offer is an invitation to talk, not an ultimatum.",

    guidanceAcceptedNext: "Congratulations! Prepare your start.",
    guidanceAcceptedItem1: "Written contract received and checked",
    guidanceAcceptedItem2: "Confirmed start date and onboarding info",
    guidanceAcceptedItem3: "Politely declined all other applications",
    guidanceAcceptedItem4: "Archived open positions here",
    guidanceAcceptedNudge: "You did it. Now the next chapter begins.",

    guidanceRejectedNext: "Get feedback and draw learning from the process.",
    guidanceRejectedItem1: "Read rejection letter carefully",
    guidanceRejectedItem2: "Request feedback (for personal contacts)",
    guidanceRejectedItem3: "Adjusted application documents for next round",
    guidanceRejectedItem4: "Identify next suitable position",
    guidanceRejectedNudge: "A rejection shows you which door fits better.",

    guidanceFailedNext:
      "Check if there is a technical problem and start again.",
    guidanceFailedItem1: "Read error message in overview",
    guidanceFailedItem2: "Check application draft manually",
    guidanceFailedItem3: "Tried to regenerate",
    guidanceFailedItem4: "Contact support if problem persists",
    guidanceFailedNudge:
      "Sometimes it hooks technically — no setback, but a hint.",

    // Account Page
    passwordAndAccess: "Password & Access",
    accountDescription: "Manage your security settings and account data.",
    deleteDataAndAccount: "Delete Data & Account",
    actionsFinalWarning: "These actions are final and cannot be undone.",
    jobsDeletedCount: "{count} jobs deleted.",
    failed: "Failed",

    // Admin Pages
    adminSettingsDescription:
      "Global system configuration and maintenance tools.",
    userManagementDescription:
      "Create and manage system users and their access levels.",
    profileDescription:
      "Manage your professional identity and resume for better matching.",
    settingsDescription:
      "Configure your notifications, language, and other preferences.",

    // Storage Settings
    storage: "Storage",
    storageDescription:
      "Manage your external document storage and cloud integrations.",
    googleDrive: "Google Drive",
    storageType: "Storage Method",
    storageStandard: "Standard (Database)",
    storageGoogleDrive: "Google Drive",
    googleDriveDescription:
      "Automatically sync your resumes and applications to Google Drive.",
    connectGoogleDrive: "Connect Google Drive",
    disconnectGoogleDrive: "Disconnect",
    connectedAs: "Connected as",
    notConnected: "Not connected",
    internalStorage: "Internal Storage",
    externalStorage: "External Storage",
    databaseDescription:
      "Files are stored directly in the application database.",
    googleDriveStorageDescription:
      "Files are synchronized with your Google Drive.",
    storageSetupGuide: "Setup Guide",
    storageStep1: "Connect your Google Drive account using the button below.",
    storageStep2:
      "Grant the necessary permissions to allow the App to save files in its own folder.",
    storageStep3:
      "All uploaded or AI-generated documents will now be automatically saved to your Google Drive.",
    googleCloudProjectSetup: "1. Google Cloud Project Setup",
    googleStep1: "Go to the Google Cloud Console and create a new project.",
    googleStep2: "Enable the 'Google Drive API' in the API Library.",
    googleStep3:
      "Configure the 'OAuth consent screen' (External) and add yourself as a Test User.",
    googleStep4:
      "Go to 'Credentials' and create an 'OAuth 2.0 Client ID' (Web Application).",
    googleStep5: "Add the following Authorized Redirect URI:",
    appConnection: "2. Connect this App",
    googleDriveConnected: "Google Drive connected successfully",
    googleDriveDisconnected: "Google Drive disconnected",
    storageRequired: "Storage Connection Required",
    storageRequiredMessage:
      "To upload files, you must first connect an external storage service like Google Drive.",
    goToSettings: "Go to Settings",
    authError: "Authentication error",
    authSuccess: "Successfully connected!",
    exporting: "Exporting...",
    exported: "Exported!",
    manualExport: "Export to Storage",

    // General Settings Tab
    general: "General",
    interfaceLanguage: "Interface Language",

    // Job Side Panel
    openPage: "Open page",
    jobDetails: "Job Details",
    panelStep: "Step",
    panelOf: "of",
    apply: "Apply",
    applicationDraftReady: "Documents ready — check the \"Application\" tab.",
    interviewPrepReady: "Preparation ready — see the \"Interview\" tab.",
    generateInterviewPrep: "Generate interview prep",
    acceptOffer: "Accept offer",
    decline: "Decline",
    jobAcceptedCongrats: "🎉 Congratulations! The job is yours.",
    markDone: "Done",
  },
  de: {
    // Navigation
    dashboard: "Dashboard",
    listings: "Stellen",
    statistics: "Statistiken",
    scheduledPlatforms: "Geplante Plattformen",
    settings: "Einstellungen",
    account: "Konto",
    userManagement: "Benutzerverwaltung",
    applications: "Bewerbungen",

    // Dashboard Shell
    collapseSidebar: "Sidebar einklappen",
    expandSidebar: "Sidebar ausklappen",
    jobAgent: "JobAgent",
    deepIntelligence: "Tiefe Intelligenz",
    more: "Mehr",

    // User Menu
    signOut: "Abmelden",
    profile: "Profil",
    help: "Hilfe",
    signedInAs: "Angemeldet als",
    member: "Mitglied",
    admin: "Administrator",
    adminArea: "Admin-Bereich",

    // Theme Toggler
    switchLight: "In den hellen Modus wechseln",
    switchDark: "In den dunklen Modus wechseln",

    // Language Toggler
    switchLanguage: "Sprache ändern",
    german: "Deutsch",
    english: "Englisch",

    // Home Page
    jobIntelligence: "Job Intelligence",
    opportunitiesDetected: "Gefundene Stellenanzeigen",
    searchPlaceholder: "Job per URL importieren...",
    scan: "IMPORT",
    systemWaiting: "System wartet auf Eingabe.",
    sortBy: "Sortieren nach:",
    relevance: "Relevanz",
    newest: "Neueste",
    analysis: "Analyse",
    applySource: "Original-Anzeige",
    generateApplication: "Bewerbung erstellen",
    viewApplication: "Bewerbung ansehen",
    failedRetry: "Fehlgeschlagen - Erneut versuchen",
    processing: "Wird verarbeitet...",
    removeFromFavorites: "Von Favoriten entfernen",
    addToFavorites: "Zu Favoriten hinzufügen",
    deleteJob: "Job löschen",
    viewDetails: "Details ansehen",
    closeDetails: "Details schließen",
    edit: "Bearbeiten",
    match: "match",
    deleteConfirm: "Möchten Sie diesen Job wirklich löschen?",
    total: "Gesamt",
    statusApplied: "Beworben",
    statusInterview: "Interview",
    statusOffer: "Angebot",
    statusRejected: "Abgelehnt",
    statusAccepted: "Angenommen",
    statusOpen: "Offen",
    statusDrafted: "Entwurf",
    updateStatus: "Status ändern",
    applicationManagement: "Bewerbungs-Management",
    applicationPipeline: "Bewerbungs-Pipeline",
    otherStatus: "Sonstige:",
    alternativePath: "Alternativer Ausgang",

    // Crawl Status
    jobSearch: "Job-Suche",
    searchingForJobs: "Suche nach Jobs...",
    jobsFound: "Jobs gefunden",
    jobsSaved: "gespeichert",
    jobsSkipped: "übersprungen",
    processingJobDetails: "{count} von {total} Job Details werden verarbeitet",
    loadJobDetails: "Job Details laden",
    extractingDescriptions: "Extrahiere Stellenbeschreibungen...",
    aiExtraction: "KI-Extraktion",
    aiExtractionCount: "{count} von {total} extrahiert",
    analyzingCount: "{count} von {total} Jobs analysiert",
    allJobsAnalyzed: "Alle Jobs erfolgreich analysiert!",
    jobsRatedAndSaved: "{count} {jobs} wurden bewertet und gespeichert.",
    job: "Job wurde",
    jobs: "Jobs wurden",
    cancelCrawl: "Crawl abbrechen",
    cancelCrawlConfirm: "Möchten Sie diesen Crawl-Job wirklich abbrechen?",
    jobImportSuccess: "Job erfolgreich importiert und analysiert.",
    jobImportAlreadyExists: "Dieser Job ist bereits in deiner Liste.",
    jobImportFailed: "Job konnte nicht importiert werden. Bitte URL prüfen.",

    // Application Modal
    applicationPreview: "Anschreiben Vorschau",
    close: "Schließen",
    copyText: "Text kopieren",
    saveAsPdf: "Als PDF speichern",
    copiedToClipboard: "In die Zwischenablage kopiert!",
    downloadFailed: "Download fehlgeschlagen",
    pdfDownloadError: "Fehler beim PDF Download.",

    // Login
    systemAccess: "System-Zugang",
    identity: "Benutzername",
    secureKey: "Passwort",
    initializeSession: "Login",
    authFailed: "Authentifizierung fehlgeschlagen.",
    systemUnreachable: "System nicht erreichbar.",

    // Settings
    profileConfiguration: "Profil-Konfiguration",
    profileSubtitle:
      "Verwalte deine berufliche Identität und Sucheinstellungen",
    saveChanges: "Änderungen speichern",
    tryAgain: "Erneut versuchen",
    notifications: "Benachrichtigungen",
    generating: "Generiere...",
    updated: "Aktualisiert!",
    saving: "Speichert...",
    saved: "Gespeichert!",
    error: "Fehler",
    success: "Erfolg",
    analyzingPdf: "Analysiere PDF... (dauert 10-20s)",
    uploadFailed: "Upload fehlgeschlagen",
    importSuccess: "CV erfolgreich importiert!",
    importFailed: "Import fehlgeschlagen",
    targetParameters: "Suchkriterien",
    targetRole: "Ziel-Rolle",
    skillsComma: "Skills (Komma-getrennt)",
    minSalary: "Mindestgehalt",
    location: "Standort",
    matchThreshold: "Matching-Schwelle",
    matchThresholdHint:
      "Jobs mit einem Score unter diesem Wert werden automatisch archiviert (0 = aus).",
    matchThresholdSaving: "Speichern...",
    matchThresholdSaved: "Gespeichert",
    matchThresholdError: "Fehler",
    preferencesNatural: "Präferenzen (Natürliche Sprache)",
    experience: "Erfahrung",
    keyProjects: "Wichtige Projekte",
    education: "Ausbildung",
    uploadCv: "Lebenslauf hochladen",
    dropPdf: "PDF ablegen, um Skills und Erfahrung automatisch zu extrahieren.",
    selectPdf: "PDF auswählen",
    analyzing: "Analysiere...",
    security: "Sicherheit",
    dangerZone: "Gefahrenzone",
    deleteAllJobs: "Alle Jobs löschen",
    deleteProfileOnly: "Nur Profil löschen",
    factoryReset: "Werkseinstellung (Alle Daten)",
    deleteJobsConfirm:
      "Sicher? Dies wird alle deine gecrawlten Jobs dauerhaft löschen.",
    deleteProfileConfirm:
      "Sicher? Dies wird dein Profil und deine CV-Daten dauerhaft löschen.",
    factoryResetConfirm:
      "WARNUNG: Dies wird ALLE Jobs, dein gesamtes Profil und alle Benachrichtigungs-Adapter-Konfigurationen löschen. Dies kann nicht rückgängig gemacht werden.",
    enterPasswordToConfirm: "Passwort zur Bestätigung eingeben:",
    incorrectPassword: "Falsches Passwort",
    loadingProfile: "Profil wird geladen...",
    startingCrawler: "Crawler wird gestartet...",
    crawlJobsDispatched: "Crawl-Jobs versandt!",
    loading: "Wird geladen...",
    dayUnit: "T",
    hourUnit: "Std",
    minUnit: "Min",
    now: "jetzt",

    // Experience & Projects Fields
    company: "Firma",
    role: "Rolle",
    duration: "Zeitraum",
    description: "Beschreibung",
    projectName: "Projektname",
    techStack: "Tech Stack",

    // Admin
    adminControlPanel: "Admin-Kontrollzentrum",
    createNewUser: "Neuen Benutzer erstellen",
    username: "Benutzername",
    password: "Passwort",
    createUser: "Benutzer erstellen",
    id: "ID",
    clearance: "Freigabe",
    actions: "Aktionen",
    delete: "Löschen",
    areYouCertain: "Bist du sicher?",
    errorCreatingUser: "Fehler beim Erstellen des Benutzers",
    verifyingClearance: "Prüfe Berechtigung...",

    // Password Change
    currentPassword: "Aktuelles Passwort",
    newPassword: "Neues Passwort",
    updatePassword: "Passwort aktualisieren",
    updating: "Aktualisiere...",
    passwordUpdated: "Passwort aktualisiert!",
    networkError: "Netzwerkfehler",

    // Schedule
    scheduleTime: "Scan-Uhrzeit",
    scheduleDays: "Wochentage",
    scheduleLabel: "Zeitplan",
    noSchedule: "Kein Zeitplan",
    dayMon: "Mo",
    dayTue: "Di",
    dayWed: "Mi",
    dayThu: "Do",
    dayFri: "Fr",
    daySat: "Sa",
    daySun: "So",

    // Job Platforms
    jobPlatforms: "Job-Plattformen",
    platformsSubtitle: "URLs und automatisierte Scan-Intervalle verwalten",
    notificationsSubtitle: "Benachrichtigungsadapter konfigurieren",
    adding: "Füge hinzu...",
    platformAdded: "Plattform hinzugefügt!",
    crawlInProgress: "Crawl läuft...",
    scanNow: "Jetzt scannen",
    remove: "Entfernen",
    everyHour: "Jede Stunde",
    every6Hours: "Alle 6 Stunden",
    every12Hours: "Alle 12 Stunden",
    every24Hours: "Alle 24 Stunden",
    everyWeek: "Jede Woche",
    neverScanned: "Noch nie gescannt",
    lastScan: "Letzter Scan",
    lastScanned: "Zuletzt: {date}",
    urlsCached: "URLs gefunden",
    addPlatformPlaceholder:
      "Neue Plattform-URL hinzufügen (z.B. LinkedIn, Indeed...)",
    invalidUrl: "Ungültiges URL-Format",
    invalidUrlProtocol: "URL muss mit http:// oder https:// beginnen",
    platformAlreadyExists: "Diese URL ist bereits in deiner Plattformliste.",
    notificationsEnabled: "Benachrichtigungen aktiviert",
    notificationsDisabled: "Benachrichtigungen deaktiviert",
    platformActive: "Plattform aktiv",
    platformInactive: "Plattform inaktiv",
    deactivated: "Deaktiviert",

    // Filters
    all: "Alle",
    favorites: "Favoriten",
    noFavorites: "Keine Favoriten",
    listView: "Liste",
    boardView: "Kanban",
    confirm: "Bestätigen",
    cancel: "Abbrechen",

    // Missing keys from reports
    removePlatform: "Plattform entfernen",
    userCreated: "Benutzer erstellt!",
    deleteUser: "Benutzer löschen",

    // Dynamic List
    addItem: "Eintrag hinzufügen",
    noEntries: "Noch keine Einträge.",
    removeEntry: "Eintrag entfernen",
    completeProfileFirst: "Bitte vervollständige zuerst dein Profil.",

    // Job list filters
    filterSearchPlaceholder: "Nach Titel oder Unternehmen suchen...",
    allDomains: "Alle Domains",
    allPlatforms: "Alle Plattformen",
    allStatuses: "Alle Status",
    withApplication: "Mit Anschreiben",
    clearAllFilters: "Alle Filter löschen",

    // Deletion actions
    alsoDeleteListings: "Auch zugehörige Listings löschen",
    deleteAllFromPlatform: "Alle von dieser Plattform löschen",
    keepFavorites: "Favoriten behalten",
    keepApplications: "Listings mit Bewerbung behalten",
    select: "Auswählen",
    selected: "ausgewählt",
    selectAllVisible: "Alle sichtbaren auswählen",
    bulkDelete: "Ausgewählte löschen",
    deleteAllFromCompany: "Alle von {company} löschen",

    // Needs Attention / Follow-up / Prep
    needsAttention: "Bedarf Aufmerksamkeit",
    prepMaterialAvailable: "Prep Material",
    followUpDue: "Follow-up fällig",

    // Job Details Modal
    overview: "Übersicht",
    application: "Bewerbung",
    interviewPrep: "Interview Prep",
    companyProfile: "Firma",
    historyTab: "Verlauf",
    noApplication: "Noch keine Bewerbung generiert",
    jobDescription: "Stellenbeschreibung anzeigen",

    // Tab Labels
    status: "Status",
    documents: "Dokumente",
    shortInfo: "Info",
    shortApp: "App",
    shortInt: "Int",
    shortCo: "Firma",
    shortStatus: "Status",
    shortDocs: "Dok.",

    // Setup Warnings
    setupRequired: "Einrichtung erforderlich",
    profileIncomplete: "Profil unvollständig",
    noNotificationAdapter: "Keine Benachrichtigungen",
    completeProfileDesc:
      "Dein Profil ist noch nicht vollständig ausgefüllt. Ergänze es für bessere Match-Ergebnisse.",
    noNotificationAdapterDesc:
      "Du hast noch keine Benachrichtigungsdienste konfiguriert. Du wirst nicht über neue Jobs informiert.",
    actionCompleteProfile: "Profil vervollständigen",
    actionConfigureNotifications: "Benachrichtigungen einrichten",
    found: "gefunden",
    new: "neu",

    // Dashboard
    dashboardSubtitle: "Deine Jobsuche auf einen Blick",
    dashboardDescription: "Deine Jobsuche im Überblick mit schnellen Aktionen.",

    // Listings Page
    listingsPageTitle: "Stellenangebote",
    listingsPageSubtitle: "Alle gefundenen Stellenanzeigen im Überblick",

    // Companies
    companies: "Firmen",
    companiesPageTitle: "Unternehmensprofile",
    companiesPageSubtitle:
      "Deep Intelligence zu allen Firmen in deiner Pipeline",
    companiesDescription:
      "Einblicke und Informationen zu den Firmen in deiner Pipeline.",

    // Language Preference
    languagePreference: "Spracheinstellung",
    spokenLanguages: "Gesprochene Sprachen",
    spokenLanguagesPlaceholder: "z.B. Deutsch (Muttersprache), Englisch (fließend)",

    // Timezone
    timezonePreference: "Zeitzone",
    timezoneDescription:
      "Wird für die Zeitplanung von Job-Plattformen verwendet. Stelle sicher, dass dies deiner lokalen Zeit entspricht.",
    timezoneSaved: "Zeitzone gespeichert",

    // First Run / Manual Analysis
    firstRunNotice:
      "Hinweis: Beim ersten Lauf wird keine automatische KI-Analyse durchgeführt.",
    triggerAnalysis: "KI-Analyse anstoßen",
    analysisTriggered: "KI-Analyse gestartet",
    timezoneSaving: "Speichern...",
    timezoneError: "Fehler beim Speichern der Zeitzone",

    // Profile Page
    profileAndResume: "Profil & Lebenslauf",
    profileCompletion: "Profil-Vollständigkeit",
    missingFields: "Fehlende Felder",
    targetJob: "Suchprofil",
    resume: "Lebenslauf",
    universityPlaceholder: "Universität, Abschluss...",
    applicationDocuments: "Bewerbungsunterlagen",
    workReferences: "Arbeitszeugnisse",
    certifications: "Zertifikate",
    uploadFiles: "Dateien hochladen",
    noWorkReferences: "Noch keine Arbeitszeugnisse hochgeladen.",
    noCertificates: "Noch keine Zertifikate hochgeladen.",

    // Settings - Notification Adapters
    deliveryMethods: "Zustellungs-Methoden",
    notificationAdapterInfo:
      "Konfiguriere hier deine Benachrichtigungs-Zugangsdaten. Die Aktivierung der Plattformen erfolgt individuell auf dem Dashboard.",
    active: "Aktiv",
    inactive: "Inaktiv",
    importantSecurityNote: "Wichtiger Sicherheitshinweis",
    pushNotifications: "Push Notifications",
    pushoverKeysInfo: "Hol dir deine Keys auf Pushover.net",
    userKey: "User Key",
    apiToken: "API Token",
    emailNotifications: "E-Mail Benachrichtigungen",
    resendApiInfo:
      "API-Schlüssel von resend.com. Jobs werden als Digest-E-Mail gebündelt versendet.",
    resendSetupGuide: "Einrichtung",
    resendStep1: "Konto auf resend.com erstellen (kostenloser Plan verfügbar)",
    resendStep2:
      "Domain verifizieren: Settings → Domains → Add Domain, dann DNS-Einträge beim Domain-Anbieter setzen",
    resendStep3:
      "API-Schlüssel erstellen: Settings → API Keys → Create API Key",
    resendStep4:
      "API-Schlüssel und Absender-E-Mail (z.B. noreply@deine-domain.de) unten eintragen und speichern",
    resendStep5:
      "Auf dem Dashboard: pro Plattform den Mail-Adapter aktivieren (✉ Symbol) und Empfänger-Adressen eintragen",
    resendApiKey: "API Key",
    resendFromEmail: "Absender-E-Mail",
    resendRecipients: "Empfänger (kommagetrennt)",
    mailjetSetupGuide: "Einrichtung",
    mailjetStep1:
      "Konto auf mailjet.com erstellen (kostenloser Plan verfügbar)",
    mailjetStep2:
      "Absender-Domain verifizieren: Sender Domains & Addresses → Add a Domain",
    mailjetStep3:
      "API-Schlüssel abrufen: Account → API Key Management → API Key + Secret Key",
    mailjetStep4:
      "API Key, Secret Key und Absender-E-Mail unten eintragen und speichern",
    mailjetStep5:
      "Auf dem Dashboard: pro Plattform den MJ-Adapter aktivieren und Empfänger-Adressen eintragen",
    mailjetApiKey: "API Key",
    mailjetSecretKey: "Secret Key",
    mailjetFromEmail: "Absender-E-Mail",
    mailjetRecipients: "Empfänger (kommagetrennt)",
    smtpEmailNotifications: "SMTP · Eigener Mailserver",
    smtpSetupTitle: "Einrichtung — Gängige Anbieter",
    smtpProviderNote:
      "Anbieter anklicken um den Host automatisch einzutragen. Alle nutzen Port 587 mit STARTTLS. Bei aktivierter 2FA ist meist ein App-Passwort nötig.",
    smtpHost: "SMTP Host",
    smtpPort: "Port",
    smtpUser: "Benutzername / E-Mail",
    smtpPassword: "Passwort / App-Passwort",
    smtpFromEmail: "Absender-E-Mail (optional)",
    smtpFromEmailHint: "Leer lassen = Benutzername wird verwendet",
    pushoverSave: "Pushover speichern",
    resendSave: "Resend speichern",
    mailjetSave: "Mailjet speichern",
    smtpSave: "SMTP speichern",
    testNotification: "Testen",
    testSending: "Wird gesendet...",
    testSent: "Gesendet!",
    testFailed: "Fehlgeschlagen",
    testRecipientTitle: "Testnachricht senden",
    testRecipientLabel: "Empfänger-E-Mail",
    testRecipientPlaceholder: "du@beispiel.de",
    sendTest: "Test senden",
    globalEmailSettings: "Globale E-Mail-Einstellungen",
    globalEmailSettingsSubtitle:
      "Gemeinsame Einstellungen für alle E-Mail-Adapter",
    globalEmailRecipient: "Globaler Empfänger",
    globalEmailRecipientDesc:
      "Diese Adresse erhält immer eine Benachrichtigung, unabhängig von den Plattform-Einstellungen",
    saveGlobalEmail: "Speichern",
    testEmailSend: "Test-E-Mail senden",
    testEmailSending: "Wird gesendet...",
    testEmailSent: "Test-E-Mail gesendet!",
    notificationTemplates: "Benachrichtigungs-Vorlagen",
    customTemplates: "Eigene Vorlagen",

    // Archive
    archiveJob: "Job archivieren",
    archiveConfirm: "Möchten Sie diesen Job wirklich archivieren?",
    restoreJob: "Job wiederherstellen",
    archiveSelected: "Ausgewählte archivieren",
    archiveAllFromCompany: "Alle von {company} archivieren",
    archiveEmpty: "Keine archivierten Jobs.",
    archivePageTitle: "Archiv",
    archivePageSubtitle: "Archivierte Stellenanzeigen",
    archiveDescription:
      "Sieh dir archivierte Stellenanzeigen an oder stelle sie wieder her.",
    deletePermanent: "Endgültig löschen",
    deletePermanentConfirm:
      "Möchten Sie diesen Job wirklich dauerhaft löschen? Hinweis: Falls die Job-Plattform aktiv bleibt, wird dieser Job beim nächsten Scan eventuell erneut importiert.",

    // JobDocumentsTab
    notes: "Notizen",
    personalNotesPlaceholder:
      "Notizen zur Stelle, Gesprächsnotizen, persönliche Eindrücke...",
    savingNotes: "Speichern...",
    notesSaved: "Gespeichert",
    tasks: "Aufgaben",
    noTasks: "Keine Aufgaben – füge eine hinzu.",
    newTask: "Neue Aufgabe...",
    files: "Dateien",
    fileLimitInfo: "PDF, DOCX, Bild – max. 10 MB",
    uploading: "Wird hochgeladen...",
    dropFileHere: "Datei hier ablegen oder klicken",
    loadingFile: "Laden...",
    clickToOpen: "Klicken zum Öffnen",
    noFiles: "Noch keine Dateien hochgeladen",
    viewFile: "Anzeigen",
    downloadFile: "Herunterladen",
    maxFileSize: "Maximale Dateigröße 10 MB",
    genericError: "Ein Fehler ist aufgetreten",

    // Guidance
    guidanceWhatNow: "Was jetzt?",
    guidanceOpenNext:
      "Prüfe den Job und entscheide, ob du dich bewerben willst.",
    guidanceOpenItem1: "KI-Analyse lesen (Übersicht-Tab)",
    guidanceOpenItem2: "Stellenbeschreibung vollständig lesen",
    guidanceOpenItem3: "Kurze Recherche zum Unternehmen",
    guidanceOpenItem4: "Bewerbungsentwurf starten",
    guidanceOpenNudge:
      "Jeder Prozess beginnt mit einer ehrlichen Selbsteinschätzung.",

    guidanceDraftedNext: "Überprüfe deinen Bewerbungsentwurf und sende ihn ab.",
    guidanceDraftedItem1: "Bewerbungsentwurf generiert",
    guidanceDraftedItem2: "Entwurf auf Vollständigkeit und Tonfall prüfen",
    guidanceDraftedItem3: "Anschreiben personalisieren (Name, Job-Referenz)",
    guidanceDraftedItem4: "Unterlagen versenden / Formular ausfüllen",
    guidanceDraftedNudge: "Perfekt ist der Feind von gut — jetzt abschicken.",

    guidanceAppliedNext:
      "Dokumentiere deine Bewerbung und plane dein Follow-up.",
    guidanceAppliedItem1: "Bewerbungsbestätigung erhalten oder geprüft",
    guidanceAppliedItem2: "Follow-up Datum gesetzt",
    guidanceAppliedItem3: "Interview-Vorbereitung erstellt",
    guidanceAppliedItem4: "Geduld: Feedback-Dauer oft 2–4 Wochen",
    guidanceAppliedNudge:
      "Du hast dich beworben — das war der schwerste Schritt.",

    guidanceInterviewNext:
      "Bereite dich intensiv auf das Vorstellungsgespräch vor.",
    guidanceInterviewItem1: "Interview-Vorbereitungsmaterial generiert",
    guidanceInterviewItem2:
      "3 eigene Stärken-Beispiele (STAR-Methode) vorbereitet",
    guidanceInterviewItem3: "Fragen an das Unternehmen vorbereitet",
    guidanceInterviewItem4: "Logistik geklärt (Ort, Zeit, Kontakt, Video-Link)",
    guidanceInterviewNudge:
      "Vorbereitung ist der Unterschied zwischen Glück und Können.",

    guidanceOfferNext:
      "Analysiere das Angebot sorgfältig, bevor du antwortest.",
    guidanceOfferItem1: "Konditionen prüfen (Gehalt, Urlaub, Remote-Anteil)",
    guidanceOfferItem2: "Gehalts-Benchmark verglichen",
    guidanceOfferItem3: "Verhandlungsspielraum identifiziert",
    guidanceOfferItem4: "48h Bedenkzeit nehmen (professionell & üblich)",
    guidanceOfferNudge:
      "Ein Angebot ist eine Einladung zum Gespräch, kein Ultimatum.",

    guidanceAcceptedNext: "Glückwunsch! Bereite deinen Start vor.",
    guidanceAcceptedItem1: "Schriftlicher Vertrag erhalten und geprüft",
    guidanceAcceptedItem2: "Starttermin und Onboarding-Infos bestätigt",
    guidanceAcceptedItem3: "Höfliche Absage an alle anderen Bewerbungen",
    guidanceAcceptedItem4: "Offene Positionen hier archiviert",
    guidanceAcceptedNudge:
      "Du hast es geschafft. Jetzt beginnt das nächste Kapitel.",

    guidanceRejectedNext: "Hol dir Feedback und ziehe Lehren aus dem Prozess.",
    guidanceRejectedItem1: "Absageschreiben sorgfältig lesen",
    guidanceRejectedItem2: "Feedback anfordern (bei persönlichen Kontakten)",
    guidanceRejectedItem3:
      "Bewerbungsunterlagen für die nächste Runde angepasst",
    guidanceRejectedItem4: "Nächste passende Position identifizieren",
    guidanceRejectedNudge: "Eine Absage zeigt dir, welche Tür besser passt.",

    guidanceFailedNext:
      "Prüfe, ob ein technisches Problem vorliegt und starte erneut.",
    guidanceFailedItem1: "Fehlermeldung in der Übersicht lesen",
    guidanceFailedItem2: "Bewerbungsentwurf manuell prüfen",
    guidanceFailedItem3: "Regenerierung versucht",
    guidanceFailedItem4:
      "Support kontaktieren, wenn das Problem bestehen bleibt",
    guidanceFailedNudge:
      "Manchmal hakt es technisch — kein Rückschlag, sondern ein Hinweis.",

    // Account Page
    passwordAndAccess: "Passwort & Zugang",
    accountDescription:
      "Verwalte deine Sicherheitseinstellungen und Kontodaten.",
    deleteDataAndAccount: "Daten & Konto löschen",
    actionsFinalWarning:
      "Diese Aktionen sind endgültig und können nicht rückgängig gemacht werden.",
    jobsDeletedCount: "{count} Jobs gelöscht.",
    failed: "Fehlgeschlagen",

    // Admin Pages
    adminSettingsDescription:
      "Globale System-Konfiguration und Wartungswerkzeuge.",
    userManagementDescription:
      "System-Benutzer erstellen und Berechtigungen verwalten.",
    profileDescription:
      "Verwalte dein berufliches Profil für bessere Ergebnisse.",
    settingsDescription:
      "Konfiguriere Benachrichtigungen, Sprache und Präferenzen.",

    // Storage Settings
    storage: "Speicher",
    storageDescription:
      "Verwalte deinen externen Dokumentenspeicher und Cloud-Integrationen.",
    googleDrive: "Google Drive",
    storageType: "Speichermethode",
    storageStandard: "Standard (Datenbank)",
    storageGoogleDrive: "Google Drive",
    googleDriveDescription:
      "Synchronisiere deine Lebensläufe und Bewerbungen automatisch mit Google Drive.",
    connectGoogleDrive: "Google Drive verbinden",
    disconnectGoogleDrive: "Verbindung trennen",
    connectedAs: "Verbunden als",
    notConnected: "Nicht verbunden",
    internalStorage: "Interner Speicher",
    externalStorage: "Externer Speicher",
    databaseDescription:
      "Dateien werden direkt in der Anwendungs-Datenbank gespeichert.",
    googleDriveStorageDescription:
      "Dateien werden mit deinem Google Drive synchronisiert.",
    storageSetupGuide: "Einrichtungs-Anleitung",
    storageStep1:
      "Verbinde dein Google Drive Konto über den untenstehenden Button.",
    storageStep2:
      "Erteile die nötigen Berechtigungen, damit die App Dateien in einem eigenen Ordner speichern darf.",
    storageStep3:
      "Alle hochgeladenen oder KI-generierten Dokumente werden ab jetzt automatisch in dein Google Drive übertragen.",
    googleCloudProjectSetup: "1. Google Cloud Projekt Einrichtung",
    googleStep1:
      "Gehe zur Google Cloud Console und erstelle ein neues Projekt.",
    googleStep2: "Aktiviere die 'Google Drive API' in der API-Bibliothek.",
    googleStep3:
      "Konfiguriere den 'OAuth-Zustimmungsbildschirm' (Extern) und füge dich als Testnutzer hinzu.",
    googleStep4:
      "Gehe zu 'Anmeldedaten' und erstelle eine 'OAuth 2.0-Client-ID' (Webanwendung).",
    googleStep5: "Füge die folgende autorisierte Weiterleitungs-URI hinzu:",
    appConnection: "2. Mit dieser App verbinden",
    googleDriveConnected: "Google Drive erfolgreich verbunden",
    googleDriveDisconnected: "Google Drive getrennt",
    storageRequired: "Speicherverbindung erforderlich",
    storageRequiredMessage:
      "Um Dateien hochzuladen, musst du zuerst einen externen Speicherdienst wie Google Drive verbinden.",
    goToSettings: "Zu den Einstellungen",
    authError: "Authentifizierungsfehler",
    authSuccess: "Erfolgreich verbunden!",
    exporting: "Exportiere...",
    exported: "Exportiert!",
    manualExport: "In Cloud-Speicher exportieren",

    // General Settings Tab
    general: "Allgemein",
    interfaceLanguage: "Oberflächensprache",

    // Job Side Panel
    openPage: "Seite öffnen",
    jobDetails: "Stellendetails",
    panelStep: "Schritt",
    panelOf: "von",
    apply: "Bewerben",
    applicationDraftReady: "Dokumente bereit — prüfe den Inhalt im Tab \"Bewerbung\".",
    interviewPrepReady: "Vorbereitung bereit — siehe Tab \"Interview\".",
    generateInterviewPrep: "Interview Prep generieren",
    acceptOffer: "Angebot annehmen",
    decline: "Ablehnen",
    jobAcceptedCongrats: "🎉 Glückwunsch! Der Job ist deiner.",
    markDone: "Erledigt",
  },
};

export type TranslationKey = keyof typeof translations.en;
