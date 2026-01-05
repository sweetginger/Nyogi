"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface AccordionProps {
  children: React.ReactNode;
  className?: string;
}

interface AccordionItemProps {
  children: React.ReactNode;
  className?: string;
}

interface AccordionTriggerProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  isOpen?: boolean;
}

interface AccordionContentProps {
  children: React.ReactNode;
  className?: string;
  isOpen?: boolean;
}

const Accordion = ({ children, className }: AccordionProps) => {
  return <div className={cn("w-full", className)}>{children}</div>;
};

const AccordionItem = ({ children, className }: AccordionItemProps) => {
  return <div className={cn("border-b", className)}>{children}</div>;
};

const AccordionTrigger = ({ children, className, onClick, isOpen }: AccordionTriggerProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between py-4 font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180",
        className
      )}
    >
      {children}
      <ChevronDown
        className={cn("h-4 w-4 shrink-0 transition-transform duration-200", isOpen && "rotate-180")}
      />
    </button>
  );
};

const AccordionContent = ({ children, className, isOpen }: AccordionContentProps) => {
  if (!isOpen) return null;
  return (
    <div className={cn("overflow-hidden text-sm transition-all", className)}>
      <div className="pb-4 pt-0">{children}</div>
    </div>
  );
};

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };

