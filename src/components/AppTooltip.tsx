import type { ComponentProps, ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type AppTooltipProps = {
  content: ReactNode;
  children: ReactElement;
} & Pick<ComponentProps<typeof TooltipContent>, "side" | "align">;

export function AppTooltip({ content, children, side, align }: AppTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side} align={align}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
