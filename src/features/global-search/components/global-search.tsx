"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";

import { globalSearchAction } from "@/features/global-search/actions";
import {
  GLOBAL_SEARCH_DEBOUNCE_MS,
  GLOBAL_SEARCH_MIN_CHARS,
  type GlobalSearchGroup,
  type GlobalSearchItem,
  type GlobalSearchResult,
} from "@/features/global-search/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type FlatEntry = {
  groupId: string;
  item: GlobalSearchItem;
};

function flattenResults(groups: GlobalSearchGroup[]): FlatEntry[] {
  return groups.flatMap((group) =>
    group.items.map((item) => ({ groupId: group.id, item })),
  );
}

function ResultsPanel({
  query,
  result,
  error,
  loading,
  activeIndex,
  onHover,
  onSelect,
  listId,
}: {
  query: string;
  result: GlobalSearchResult | null;
  error: string | null;
  loading: boolean;
  activeIndex: number;
  onHover: (index: number) => void;
  onSelect: (item: GlobalSearchItem) => void;
  listId: string;
}) {
  if (query.trim().length > 0 && query.trim().length < GLOBAL_SEARCH_MIN_CHARS) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">
        Digite pelo menos {GLOBAL_SEARCH_MIN_CHARS} caracteres.
      </p>
    );
  }

  if (loading && !result) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground" role="status">
        Buscando…
      </p>
    );
  }

  if (error) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground" role="alert">
        {error}
      </p>
    );
  }

  if (!result || result.groups.length === 0) {
    if (!query.trim()) {
      return (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          Busque clientes, pets, telefone, produtos e mais.
        </p>
      );
    }

    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">
        Nenhum resultado encontrado para &ldquo;{result?.query ?? query}&rdquo;.
      </p>
    );
  }

  const sections = result.groups.reduce<
    Array<{ group: GlobalSearchGroup; startIndex: number }>
  >((acc, group) => {
    const startIndex = acc.reduce(
      (sum, entry) => sum + entry.group.items.length,
      0,
    );
    acc.push({ group, startIndex });
    return acc;
  }, []);

  return (
    <div id={listId} role="listbox" aria-label="Resultados da busca" className="space-y-4 py-2">
      {loading ? (
        <p className="px-4 text-xs text-muted-foreground" role="status">
          Atualizando…
        </p>
      ) : null}
      {sections.map(({ group, startIndex }) => (
        <section key={group.id} className="space-y-1">
          <div className="flex items-center justify-between gap-2 px-4">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {group.label}
            </h3>
            {group.hasMore && group.hrefAll ? (
              <Link
                href={`${group.hrefAll}?q=${encodeURIComponent(result.query)}`}
                className="text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                Ver todos
              </Link>
            ) : null}
          </div>
          <ul className="px-2">
            {group.items.map((item, itemIndex) => {
              const index = startIndex + itemIndex;
              const active = index === activeIndex;
              return (
                <li key={`${group.id}-${item.id}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    id={`${listId}-option-${index}`}
                    className={cn(
                      "flex w-full flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left transition-colors",
                      active ? "bg-muted" : "hover:bg-muted/70",
                    )}
                    onMouseEnter={() => onHover(index)}
                    onClick={() => onSelect(item)}
                  >
                    <span className="text-sm font-medium text-foreground">{item.title}</span>
                    {item.subtitle ? (
                      <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function GlobalSearch() {
  const router = useRouter();
  const listId = useId();
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<GlobalSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openDesktop, setOpenDesktop] = useState(false);
  const [openMobile, setOpenMobile] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pending, startTransition] = useTransition();
  const requestIdRef = useRef(0);

  const displayResult =
    query.trim().length < GLOBAL_SEARCH_MIN_CHARS ? null : result;
  const displayError =
    query.trim().length < GLOBAL_SEARCH_MIN_CHARS ? null : error;
  const flat = flattenResults(displayResult?.groups ?? []);

  const runSearch = useCallback((value: string) => {
    const nextId = ++requestIdRef.current;
    startTransition(async () => {
      const response = await globalSearchAction(value);
      if (nextId !== requestIdRef.current) {
        return;
      }
      if (!response.ok) {
        setError(response.error);
        setResult(null);
        return;
      }
      setError(null);
      setResult(response.data);
      setActiveIndex(0);
    });
  }, []);

  useEffect(() => {
    if (query.trim().length < GLOBAL_SEARCH_MIN_CHARS) {
      return;
    }

    const timer = window.setTimeout(() => {
      runSearch(query);
    }, GLOBAL_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query, runSearch]);

  useEffect(() => {
    function onKeyDown(event: Event) {
      const keyboardEvent = event as unknown as globalThis.KeyboardEvent;
      if (!(keyboardEvent.metaKey || keyboardEvent.ctrlKey)) {
        return;
      }
      if (keyboardEvent.key.toLowerCase() !== "k") {
        return;
      }
      keyboardEvent.preventDefault();
      if (window.matchMedia("(max-width: 639px)").matches) {
        setOpenMobile(true);
        window.setTimeout(() => mobileInputRef.current?.focus(), 50);
      } else {
        setOpenDesktop(true);
        desktopInputRef.current?.focus();
        desktopInputRef.current?.select();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function selectItem(item: GlobalSearchItem) {
    setOpenDesktop(false);
    setOpenMobile(false);
    setQuery("");
    setResult(null);
    router.push(item.href);
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpenDesktop(false);
      setOpenMobile(false);
      setQuery("");
      setResult(null);
      (event.target as HTMLInputElement).blur();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, Math.max(flat.length - 1, 0)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      const active = flat[activeIndex];
      if (active) {
        event.preventDefault();
        selectItem(active.item);
      }
    }
  }

  const panelProps = {
    query,
    result: displayResult,
    error: displayError,
    loading: pending,
    activeIndex,
    onHover: setActiveIndex,
    onSelect: selectItem,
    listId,
  };

  return (
    <>
      {/* Desktop */}
      <div className="relative hidden w-full sm:block sm:max-w-md">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          ref={desktopInputRef}
          className="h-10 pr-16 pl-9"
          placeholder="Buscar cliente, pet, telefone, produto..."
          aria-label="Buscar no PetGestor"
          aria-controls={listId}
          aria-expanded={openDesktop && query.trim().length >= GLOBAL_SEARCH_MIN_CHARS}
          aria-autocomplete="list"
          aria-activedescendant={
            openDesktop && flat[activeIndex]
              ? `${listId}-option-${activeIndex}`
              : undefined
          }
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpenDesktop(true);
          }}
          onFocus={() => setOpenDesktop(true)}
          onKeyDown={onInputKeyDown}
          autoComplete="off"
        />
        <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground md:inline-block">
          ⌘K
        </kbd>

        {openDesktop ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-30 cursor-default bg-transparent"
              aria-label="Fechar busca"
              onClick={() => setOpenDesktop(false)}
            />
            <div className="absolute top-full right-0 left-0 z-40 mt-2 max-h-[min(70vh,28rem)] overflow-y-auto rounded-xl border bg-popover shadow-lg">
              <ResultsPanel {...panelProps} />
            </div>
          </>
        ) : null}
      </div>

      {/* Mobile trigger */}
      <div className="sm:hidden">
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full justify-start gap-2 px-3 text-muted-foreground"
          aria-label="Abrir busca no PetGestor"
          onClick={() => {
            setOpenMobile(true);
            window.setTimeout(() => mobileInputRef.current?.focus(), 50);
          }}
        >
          <Search className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">Buscar cliente, pet, telefone…</span>
        </Button>
      </div>

      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent side="bottom" className="flex h-[92vh] max-h-[92vh] flex-col gap-0 p-0 sm:max-w-none">
          <SheetHeader className="border-b px-4 py-3 text-left">
            <div className="flex items-center gap-2 pr-8">
              <SheetTitle className="sr-only">Busca no PetGestor</SheetTitle>
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  ref={mobileInputRef}
                  className="h-11 pl-9"
                  placeholder="Buscar cliente, pet, telefone, produto..."
                  aria-label="Buscar no PetGestor"
                  aria-controls={listId}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={onInputKeyDown}
                  autoComplete="off"
                />
              </div>
              {query ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Limpar busca"
                  onClick={() => {
                    setQuery("");
                    setResult(null);
                    mobileInputRef.current?.focus();
                  }}
                >
                  <X className="size-4" />
                </Button>
              ) : null}
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            <ResultsPanel {...panelProps} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
