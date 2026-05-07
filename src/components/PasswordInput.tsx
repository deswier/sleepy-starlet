import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

// Tabbed eye-button is intentionally tabIndex={-1} so keyboard tab order
// stays Email → Password → Submit; mouse/touch users still get the toggle.
export function PasswordInput({
  id, value, onChange,
  required, minLength, autoComplete, "aria-invalid": ariaInvalid,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  "aria-invalid"?: boolean;
}) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        aria-invalid={ariaInvalid}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pr-10"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        tabIndex={-1}
        aria-label={show ? t("auth.hidePassword") : t("auth.showPassword")}
        onClick={() => setShow((s) => !s)}
        className="absolute right-0 top-0 h-full w-10 text-muted-foreground hover:bg-transparent"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </Button>
    </div>
  );
}
