import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function PasswordInput({
  value,
  onChange,
  className = "",
  ...props
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative">
      <input
        type={showPassword ? "text" : "password"}
        value={value}
        onChange={onChange}
        autoComplete="new-password"
        className={`
                    w-full bg-slate-50 dark:bg-slate-950/50 
                    border border-slate-200 dark:border-slate-800 
                    text-slate-900 dark:text-white 
                    rounded-xl px-4 py-2.5 pr-10
                    focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 
                    transition-all
                    ${className}
                `}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShowPassword(!showPassword)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
      >
        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
