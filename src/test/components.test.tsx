import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import { PasswordInput } from "@/components/PasswordInput";
import { RequiredMark } from "@/components/RequiredMark";

// Wrap components that use useTranslation
const wrap = (ui: React.ReactElement) =>
  render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);

// ─── RequiredMark ──────────────────────────────────────────────────────────

describe("RequiredMark", () => {
  it("renders an asterisk", () => {
    render(<RequiredMark />);
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("has aria-hidden so screen readers skip it", () => {
    render(<RequiredMark />);
    expect(screen.getByText("*")).toHaveAttribute("aria-hidden");
  });

  it("applies text-destructive colour class", () => {
    render(<RequiredMark />);
    expect(screen.getByText("*").className).toMatch(/text-destructive/);
  });
});

// ─── PasswordInput ─────────────────────────────────────────────────────────

describe("PasswordInput", () => {
  it("renders a password input by default", () => {
    wrap(<PasswordInput value="" onChange={() => {}} />);
    // password inputs don't get the textbox ARIA role — query directly
    const input = document.querySelector("input");
    expect(input).toBeInTheDocument();
    expect(input?.type).toBe("password");
  });

  it("toggle button shows the password (type becomes text)", () => {
    wrap(<PasswordInput value="secret" onChange={() => {}} />);
    const toggle = screen.getByRole("button");
    fireEvent.click(toggle);
    const input = document.querySelector("input");
    expect(input?.type).toBe("text");
  });

  it("clicking toggle again hides the password", () => {
    wrap(<PasswordInput value="secret" onChange={() => {}} />);
    const toggle = screen.getByRole("button");
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    const input = document.querySelector("input");
    expect(input?.type).toBe("password");
  });

  it("calls onChange when the user types", () => {
    let captured = "";
    wrap(<PasswordInput value="" onChange={(v) => { captured = v; }} />);
    const input = document.querySelector("input")!;
    fireEvent.change(input, { target: { value: "newpass" } });
    expect(captured).toBe("newpass");
  });

  it("toggle button has tabIndex -1 so keyboard tab skips it", () => {
    wrap(<PasswordInput value="" onChange={() => {}} />);
    const toggle = screen.getByRole("button");
    expect(toggle).toHaveAttribute("tabindex", "-1");
  });

  it("passes id to the underlying input", () => {
    wrap(<PasswordInput id="my-pw" value="" onChange={() => {}} />);
    expect(document.getElementById("my-pw")).toBeInTheDocument();
  });

  it("applies aria-invalid when prop is true", () => {
    wrap(<PasswordInput value="" onChange={() => {}} aria-invalid={true} />);
    const input = document.querySelector("input")!;
    expect(input).toHaveAttribute("aria-invalid", "true");
  });
});
