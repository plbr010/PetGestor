import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const SIZE_CLASS = {
  sm: "size-9 text-xs",
  md: "size-11 text-sm",
  lg: "size-14 text-base",
} as const;

type PetAvatarProps = {
  name: string;
  photoUrl?: string | null;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
};

function petInitials(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "P"
  );
}

export function PetAvatar({ name, photoUrl, size = "md", className }: PetAvatarProps) {
  return (
    <Avatar className={cn(SIZE_CLASS[size], "shrink-0", className)}>
      {photoUrl ? <AvatarImage src={photoUrl} alt={name} /> : null}
      <AvatarFallback className="font-medium">{petInitials(name)}</AvatarFallback>
    </Avatar>
  );
}
