"use client";
import React, { useRef, useEffect } from "react";

interface AutoResizeTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  onValueChange?: (value: string) => void;
}

const AutoResizeTextarea: React.FC<AutoResizeTextareaProps> = ({
  value,
  onChange,
  className,
  rows = 1,
  ...props
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.minHeight = "auto";
      textarea.style.minHeight = `${textarea.scrollHeight}px`;
    }
  };

  useEffect(() => {
    resize();
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (onChange) {
      onChange(e);
    }
    resize();
  };

  return (
    <textarea
      {...props}
      ref={textareaRef}
      value={value}
      onChange={handleChange}
      className={`${className} resize-y`}
      rows={rows}
    />
  );
};

export default AutoResizeTextarea;
