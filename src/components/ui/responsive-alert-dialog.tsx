import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { Drawer as DrawerPrimitive } from "vaul";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

// Shared responsive confirmation dialog. Desktop renders a Radix AlertDialog;
// mobile renders a vaul bottom-sheet. Consumers should pass dismissible={false}
// while a destructive action is in flight to block swipe/outside-tap dismissal.
type Ctx = { isMobile: boolean };
const ResponsiveAlertContext = React.createContext<Ctx>({ isMobile: false });
const useResponsiveAlert = () => React.useContext(ResponsiveAlertContext);

interface ResponsiveAlertDialogProps extends React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Root> {
  /** Mobile-only: when false, swipe-to-close and tap-outside-to-close are blocked. Desktop unchanged. */
  dismissible?: boolean;
}

const ResponsiveAlertDialog = ({ children, dismissible = true, ...props }: ResponsiveAlertDialogProps) => {
  const isMobile = useIsMobile();
  const value = React.useMemo(() => ({ isMobile }), [isMobile]);
  return (
    <ResponsiveAlertContext.Provider value={value}>
      {isMobile ? (
        <DrawerPrimitive.Root dismissible={dismissible} {...(props as React.ComponentProps<typeof DrawerPrimitive.Root>)}>
          {children}
        </DrawerPrimitive.Root>
      ) : (
        <AlertDialogPrimitive.Root {...props}>{children}</AlertDialogPrimitive.Root>
      )}
    </ResponsiveAlertContext.Provider>
  );
};

const ResponsiveAlertDialogContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const { isMobile } = useResponsiveAlert();

  if (isMobile) {
    return (
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DrawerPrimitive.Content
          ref={ref}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col rounded-t-2xl border bg-background outline-none",
            className,
          )}
          {...props}
        >
          <div className="mx-auto mt-2 mb-1 h-1.5 w-12 shrink-0 rounded-full bg-muted" aria-hidden />
          <div className="flex-1 overflow-y-auto overscroll-contain px-6 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    );
  }

  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-50 bg-black/40",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        )}
      />
      <AlertDialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "sm:rounded-lg",
          className,
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  );
});
ResponsiveAlertDialogContent.displayName = "ResponsiveAlertDialogContent";

const ResponsiveAlertDialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
);
ResponsiveAlertDialogHeader.displayName = "ResponsiveAlertDialogHeader";

const ResponsiveAlertDialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-0 sm:space-x-2", className)} {...props} />
);
ResponsiveAlertDialogFooter.displayName = "ResponsiveAlertDialogFooter";

const ResponsiveAlertDialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => {
  const { isMobile } = useResponsiveAlert();
  const Comp: React.ElementType = isMobile ? DrawerPrimitive.Title : AlertDialogPrimitive.Title;
  return <Comp ref={ref} className={cn("text-lg font-semibold", className)} {...props} />;
});
ResponsiveAlertDialogTitle.displayName = "ResponsiveAlertDialogTitle";

const ResponsiveAlertDialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => {
  const { isMobile } = useResponsiveAlert();
  const Comp: React.ElementType = isMobile ? DrawerPrimitive.Description : AlertDialogPrimitive.Description;
  return <Comp ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />;
});
ResponsiveAlertDialogDescription.displayName = "ResponsiveAlertDialogDescription";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

const ResponsiveAlertDialogAction = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => {
    const { isMobile } = useResponsiveAlert();
    if (isMobile) {
      // Plain button on mobile; the consumer's onClick is responsible for
      // closing the drawer (matches existing onClick={(e) => { e.preventDefault(); ... }}
      // patterns where async handlers close after completion).
      return <button ref={ref} type="button" className={cn(buttonVariants(), className)} {...props} />;
    }
    return <AlertDialogPrimitive.Action ref={ref} className={cn(buttonVariants(), className)} {...props} />;
  },
);
ResponsiveAlertDialogAction.displayName = "ResponsiveAlertDialogAction";

const ResponsiveAlertDialogCancel = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => {
    const { isMobile } = useResponsiveAlert();
    if (isMobile) {
      // Wrap with DrawerPrimitive.Close so the cancel button dismisses the
      // sheet without consumers needing to wire onClick → onOpenChange(false).
      return (
        <DrawerPrimitive.Close asChild>
          <button
            ref={ref}
            type="button"
            className={cn(buttonVariants({ variant: "outline" }), "mt-2 sm:mt-0", className)}
            {...props}
          />
        </DrawerPrimitive.Close>
      );
    }
    return (
      <AlertDialogPrimitive.Cancel
        ref={ref}
        className={cn(buttonVariants({ variant: "outline" }), "mt-2 sm:mt-0", className)}
        {...props}
      />
    );
  },
);
ResponsiveAlertDialogCancel.displayName = "ResponsiveAlertDialogCancel";

export {
  ResponsiveAlertDialog,
  ResponsiveAlertDialogContent,
  ResponsiveAlertDialogHeader,
  ResponsiveAlertDialogFooter,
  ResponsiveAlertDialogTitle,
  ResponsiveAlertDialogDescription,
  ResponsiveAlertDialogAction,
  ResponsiveAlertDialogCancel,
};
