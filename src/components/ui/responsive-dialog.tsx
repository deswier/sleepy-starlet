import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Drawer as DrawerPrimitive } from "vaul";
import { X } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

// Shared responsive container for app modals. Renders a centered Radix Dialog
// on desktop and a vaul bottom-sheet on mobile (<768px). API mirrors the
// shadcn Dialog parts so call sites only swap imports.
type Ctx = { isMobile: boolean; dismissible: boolean };
const ResponsiveDialogContext = React.createContext<Ctx>({ isMobile: false, dismissible: true });
const useResponsiveDialog = () => React.useContext(ResponsiveDialogContext);

interface ResponsiveDialogProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Root> {
  /**
   * Mobile-only: when false, disables swipe-to-close and tap-outside-to-close
   * on the bottom sheet. Desktop behavior is unaffected.
   */
  dismissible?: boolean;
}

const ResponsiveDialog = ({ children, dismissible = true, ...props }: ResponsiveDialogProps) => {
  const isMobile = useIsMobile();
  const value = React.useMemo(() => ({ isMobile, dismissible }), [isMobile, dismissible]);
  return (
    <ResponsiveDialogContext.Provider value={value}>
      {isMobile ? (
        <DrawerPrimitive.Root dismissible={dismissible} {...(props as React.ComponentProps<typeof DrawerPrimitive.Root>)}>
          {children}
        </DrawerPrimitive.Root>
      ) : (
        <DialogPrimitive.Root {...props}>{children}</DialogPrimitive.Root>
      )}
    </ResponsiveDialogContext.Provider>
  );
};

const ResponsiveDialogTrigger = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger>
>((props, ref) => {
  const { isMobile } = useResponsiveDialog();
  const Comp: React.ElementType = isMobile ? DrawerPrimitive.Trigger : DialogPrimitive.Trigger;
  return <Comp ref={ref} {...props} />;
});
ResponsiveDialogTrigger.displayName = "ResponsiveDialogTrigger";

const ResponsiveDialogClose = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close>
>((props, ref) => {
  const { isMobile } = useResponsiveDialog();
  const Comp: React.ElementType = isMobile ? DrawerPrimitive.Close : DialogPrimitive.Close;
  return <Comp ref={ref} {...props} />;
});
ResponsiveDialogClose.displayName = "ResponsiveDialogClose";

const ResponsiveDialogContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const { isMobile, dismissible } = useResponsiveDialog();

  if (isMobile) {
    return (
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DrawerPrimitive.Content
          ref={ref}
          className={cn(
            // z-[70] sits above AppShell header/nav (z-[60]) so the drawer's
            // action buttons aren't clipped by the bottom nav. Overlay stays
            // at z-50 below the nav to keep the chrome visually undimmed.
            "fixed inset-x-0 bottom-0 z-[70] flex max-h-[90dvh] flex-col rounded-t-2xl border bg-background outline-none",
            className,
          )}
          {...props}
        >
          {dismissible && (
            <div className="mx-auto mt-2 mb-1 h-1.5 w-12 shrink-0 rounded-full bg-muted" aria-hidden />
          )}
          <div className="flex-1 overflow-y-auto overscroll-contain px-6 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    );
  }

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-50 bg-black/40",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        )}
      />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "sm:rounded-lg max-h-[90vh] overflow-y-auto overscroll-contain",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute right-2 top-2 inline-flex h-11 w-11 items-center justify-center rounded-md opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
ResponsiveDialogContent.displayName = "ResponsiveDialogContent";

const ResponsiveDialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
ResponsiveDialogHeader.displayName = "ResponsiveDialogHeader";

const ResponsiveDialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
ResponsiveDialogFooter.displayName = "ResponsiveDialogFooter";

const ResponsiveDialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => {
  const { isMobile } = useResponsiveDialog();
  const Comp: React.ElementType = isMobile ? DrawerPrimitive.Title : DialogPrimitive.Title;
  return (
    <Comp
      ref={ref}
      className={cn("text-lg font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
});
ResponsiveDialogTitle.displayName = "ResponsiveDialogTitle";

const ResponsiveDialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => {
  const { isMobile } = useResponsiveDialog();
  const Comp: React.ElementType = isMobile ? DrawerPrimitive.Description : DialogPrimitive.Description;
  return <Comp ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />;
});
ResponsiveDialogDescription.displayName = "ResponsiveDialogDescription";

export {
  ResponsiveDialog,
  ResponsiveDialogTrigger,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
};
