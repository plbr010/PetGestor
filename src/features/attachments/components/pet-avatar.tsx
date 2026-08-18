import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function PetAvatar({
  name,
  photoUrl,
  className,
  size = "default",
}: {
  name: string;
  photoUrl?: string | null;
  className?: string;
  size?: "default" | "sm" | "lg";
}) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <Avatar className={cn(className)} size={size}>
      {photoUrl ? <AvatarImage src={photoUrl} alt={name} /> : null}
      <AvatarFallback>{initials || "P"}</AvatarFallback>
    </Avatar>
  );
}
