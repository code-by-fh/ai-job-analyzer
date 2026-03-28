"use client";

import { useLanguage } from "./LanguageProvider";

export default function LanguageToggler() {
  const { language, setLanguage, t } = useLanguage();

  const toggleLanguage = () => {
    setLanguage(language === "en" ? "de" : "en");
  };

  return (
    <button
      onClick={toggleLanguage}
      className="
                relative w-16 h-9 rounded-full p-1 transition-all duration-300 cursor-pointer
                bg-slate-200 dark:bg-slate-800
                shadow-lg hover:shadow-xl
                hover:scale-105 active:scale-95
                flex items-center
                border border-slate-300 dark:border-slate-700
            "
      title={t("switchLanguage")}
    >
      {/* Sliding background indicator */}
      <div
        className={`
                absolute w-7 h-7 rounded-full transition-all duration-300 ease-out
                bg-indigo-600 dark:bg-indigo-500
                shadow-md
                ${language === "en" ? "translate-x-7" : "translate-x-0"}
            `}
      ></div>

      {/* Labels */}
      <div className="relative w-full flex justify-between px-1.5 text-[10px] font-bold z-10 select-none">
        <span
          className={`transition-colors duration-300 ${language === "de" ? "text-white" : "text-slate-500 dark:text-slate-400"}`}
        >
          DE
        </span>
        <span
          className={`transition-colors duration-300 ${language === "en" ? "text-white" : "text-slate-500 dark:text-slate-400"}`}
        >
          EN
        </span>
      </div>
    </button>
  );
}
