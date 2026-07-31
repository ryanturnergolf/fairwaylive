"use client";

import Link from "next/link";
import { CoachBreadcrumbs, CoachHeader, CoachState } from "../components/CoachChrome";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  statisticInputTypes,
  type StatisticDefinitionConfiguration,
  type StatisticInputType,
} from "../../lib/dynamicStatisticsModel";
import {
  assignPackageToEvent,
  createCoachStatisticDefinition,
  createCoachStatisticPackage,
  loadCoachStatisticConfiguration,
  reviseCoachStatisticDefinition,
  reviseCoachStatisticPackage,
  setCoachStatisticDefinitionArchived,
  setCoachStatisticPackageArchived,
  type CoachStatisticConfigurationReadModel,
} from "../../lib/services/dynamicStatisticsService";

const emptyReadModel: CoachStatisticConfigurationReadModel = {
  definitions: [],
  packages: [],
  assignments: [],
  assignmentTargets: [],
};

const inputLabels: Record<StatisticInputType, string> = {
  checkbox: "Checkbox",
  yes_no: "Yes / No",
  bounded_number: "Bounded number",
  option_list: "Option list",
};

type DefinitionForm = {
  definitionId: string;
  key: string;
  name: string;
  description: string;
  inputType: StatisticInputType;
  minimum: string;
  maximum: string;
  options: string;
  pars: number[];
};

const emptyDefinitionForm = (): DefinitionForm => ({
  definitionId: "",
  key: "",
  name: "",
  description: "",
  inputType: "yes_no",
  minimum: "0",
  maximum: "10",
  options: "Option 1\nOption 2",
  pars: [],
});

type PackageFormItem = {
  definitionId: string;
  isRequired: boolean;
};

type PackageForm = {
  packageId: string;
  name: string;
  description: string;
  items: PackageFormItem[];
};

const emptyPackageForm = (): PackageForm => ({
  packageId: "",
  name: "",
  description: "",
  items: [],
});

const buildConfiguration = (form: DefinitionForm): StatisticDefinitionConfiguration => {
  if (form.inputType === "bounded_number") {
    return { minimum: Number(form.minimum), maximum: Number(form.maximum) };
  }
  if (form.inputType === "option_list") {
    return { options: form.options.split(/\r?\n|,/).map((option) => option.trim()).filter(Boolean) };
  }
  return {};
};

const statusBadge = (active: boolean) =>
  active ? "bg-[#E6F3F1] text-[#0B3D2E]" : "bg-[#F4E8E4] text-[#8A2E2E]";

export default function StatisticsManager() {
  const [readModel, setReadModel] = useState(emptyReadModel);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [section, setSection] = useState<"definitions" | "packages" | "assignments">("definitions");
  const [definitionForm, setDefinitionForm] = useState<DefinitionForm | null>(null);
  const [packageForm, setPackageForm] = useState<PackageForm | null>(null);
  const [assignmentForm, setAssignmentForm] = useState({
    eventType: "tournament" as "tournament" | "qualifying" | "practice",
    eventId: "",
    packageVersionId: "",
  });

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      setReadModel(await loadCoachStatisticConfiguration());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load statistics configuration.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const versionToDefinition = useMemo(() => {
    const result = new Map<string, string>();
    for (const entry of readModel.definitions) {
      for (const version of entry.versions) result.set(version.id, entry.definition.id);
    }
    return result;
  }, [readModel.definitions]);

  const definitionById = useMemo(
    () => new Map(readModel.definitions.map((entry) => [entry.definition.id, entry])),
    [readModel.definitions]
  );

  const targetOptions = useMemo(
    () => readModel.assignmentTargets.filter((target) => target.eventType === assignmentForm.eventType),
    [assignmentForm.eventType, readModel.assignmentTargets]
  );

  const clearNotices = () => {
    setError("");
    setMessage("");
  };

  const saveDefinition = async (event: FormEvent) => {
    event.preventDefault();
    if (!definitionForm) return;
    setIsSaving(true);
    clearNotices();
    try {
      const input = {
        name: definitionForm.name,
        description: definitionForm.description,
        inputType: definitionForm.inputType,
        configuration: buildConfiguration(definitionForm),
        applicability: definitionForm.pars.length ? { pars: definitionForm.pars } : {},
      };
      if (definitionForm.definitionId) {
        await reviseCoachStatisticDefinition({
          definitionId: definitionForm.definitionId,
          ...input,
        });
        setMessage("A new immutable statistic version was created.");
      } else {
        await createCoachStatisticDefinition({ key: definitionForm.key, ...input });
        setMessage("Custom statistic created.");
      }
      setDefinitionForm(null);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the statistic.");
    } finally {
      setIsSaving(false);
    }
  };

  const beginDefinitionRevision = (definitionId: string) => {
    const entry = definitionById.get(definitionId);
    if (!entry || entry.definition.isBuiltIn) return;
    const configuration = entry.latestVersion.configuration;
    setDefinitionForm({
      definitionId,
      key: entry.definition.key,
      name: entry.latestVersion.name,
      description: entry.latestVersion.description ?? "",
      inputType: entry.latestVersion.inputType,
      minimum: String(configuration.minimum ?? 0),
      maximum: String(configuration.maximum ?? 10),
      options: configuration.options?.join("\n") ?? "Option 1\nOption 2",
      pars: entry.latestVersion.applicability.pars ?? [],
    });
    clearNotices();
  };

  const toggleDefinitionArchive = async (definitionId: string, archived: boolean) => {
    setIsSaving(true);
    clearNotices();
    try {
      await setCoachStatisticDefinitionArchived(definitionId, archived);
      setMessage(archived ? "Statistic archived. Historical versions remain available." : "Statistic restored.");
      await load();
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Unable to update the statistic.");
    } finally {
      setIsSaving(false);
    }
  };

  const beginPackageRevision = (packageId: string) => {
    const entry = readModel.packages.find((candidate) => candidate.package.id === packageId);
    if (!entry) return;
    setPackageForm({
      packageId,
      name: entry.latestVersion.name,
      description: entry.latestVersion.description ?? "",
      items: entry.latestItems.flatMap((item) => {
        const definitionId = versionToDefinition.get(item.definitionVersionId);
        return definitionId ? [{ definitionId, isRequired: item.isRequired }] : [];
      }),
    });
    clearNotices();
  };

  const togglePackageItem = (definitionId: string) => {
    setPackageForm((current) => {
      if (!current) return current;
      const exists = current.items.some((item) => item.definitionId === definitionId);
      return {
        ...current,
        items: exists
          ? current.items.filter((item) => item.definitionId !== definitionId)
          : [...current.items, { definitionId, isRequired: false }],
      };
    });
  };

  const movePackageItem = (index: number, direction: -1 | 1) => {
    setPackageForm((current) => {
      if (!current) return current;
      const target = index + direction;
      if (target < 0 || target >= current.items.length) return current;
      const items = [...current.items];
      [items[index], items[target]] = [items[target], items[index]];
      return { ...current, items };
    });
  };

  const savePackage = async (event: FormEvent) => {
    event.preventDefault();
    if (!packageForm) return;
    setIsSaving(true);
    clearNotices();
    try {
      const input = {
        name: packageForm.name,
        description: packageForm.description,
        items: packageForm.items.map((item, displayOrder) => ({
          definitionVersionId: definitionById.get(item.definitionId)?.latestVersion.id ?? "",
          displayOrder,
          isRequired: item.isRequired,
        })),
      };
      if (packageForm.packageId) {
        await reviseCoachStatisticPackage({ packageId: packageForm.packageId, ...input });
        setMessage("A new immutable package version was created.");
      } else {
        await createCoachStatisticPackage(input);
        setMessage("Statistic package created.");
      }
      setPackageForm(null);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the package.");
    } finally {
      setIsSaving(false);
    }
  };

  const togglePackageArchive = async (packageId: string, archived: boolean) => {
    setIsSaving(true);
    clearNotices();
    try {
      await setCoachStatisticPackageArchived(packageId, archived);
      setMessage(archived ? "Package archived. Historical versions remain pinned." : "Package restored.");
      await load();
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Unable to update the package.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveAssignment = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    clearNotices();
    try {
      await assignPackageToEvent(assignmentForm);
      setMessage("Package version assigned. Existing assignments remain immutable.");
      await load();
    } catch (assignmentError) {
      setError(assignmentError instanceof Error ? assignmentError.message : "Unable to assign the package.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F6F1E6] text-[#0B3D2E]">
      <CoachHeader />
      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <CoachBreadcrumbs items={[{ label: "Coach Dashboard", href: "/coach-dashboard" }, { label: "Statistics Configuration" }]} />
        <Link href="/coach-dashboard" className="text-sm font-bold">← Coach Dashboard</Link>
        <div className="mt-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#B8892D]">Coach Configuration</p>
            <h1 className="mt-2 text-4xl font-black">Dynamic Statistics</h1>
            <p className="mt-3 max-w-3xl text-[#51635C]">
              Configure immutable statistic definitions and packages. This does not change mobile scorecards yet.
            </p>
          </div>
          <div className="rounded-lg border border-[#D9D0C0] bg-white px-4 py-3 text-sm font-semibold text-[#51635C]">
            Historical definitions and packages cannot be deleted.
          </div>
        </div>

        <nav className="mt-7 flex flex-wrap gap-2" aria-label="Statistics configuration sections">
          {(["definitions", "packages", "assignments"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setSection(item)}
              className={`rounded-lg px-4 py-3 text-sm font-black capitalize ${
                section === item ? "bg-[#0B3D2E] text-white" : "border border-[#0B3D2E] bg-white"
              }`}
            >
              {item}
            </button>
          ))}
        </nav>

        <div aria-live="polite" className="mt-5">
          {error ? <CoachState title="Unable to load statistics configuration" description={error} tone="error" /> : null}
          {message ? <p className="rounded-lg border border-[#2E6F76] bg-[#E6F3F1] p-3 font-bold">{message}</p> : null}
        </div>

        {isLoading ? <div className="mt-8"><CoachState title="Loading statistics configuration" description="Retrieving immutable definitions, packages, and event assignments." /></div> : null}

        {!isLoading && section === "definitions" ? (
          <section className="mt-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black">Statistic Definitions</h2>
                <p className="mt-1 text-sm text-[#51635C]">Built-ins are shared and read-only. Custom edits create a new version.</p>
              </div>
              <button type="button" onClick={() => setDefinitionForm(emptyDefinitionForm())} className="rounded-lg bg-[#0B3D2E] px-4 py-3 font-black text-white">
                Create Custom Statistic
              </button>
            </div>

            {definitionForm ? (
              <form onSubmit={saveDefinition} className="mt-5 rounded-lg border border-[#B8892D] bg-white p-5">
                <h3 className="text-xl font-black">{definitionForm.definitionId ? "Create New Statistic Version" : "New Custom Statistic"}</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-bold">Key<input required disabled={Boolean(definitionForm.definitionId)} value={definitionForm.key} onChange={(event) => setDefinitionForm({ ...definitionForm, key: event.target.value })} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2 disabled:bg-[#F6F1E6]" /></label>
                  <label className="text-sm font-bold">Name<input required value={definitionForm.name} onChange={(event) => setDefinitionForm({ ...definitionForm, name: event.target.value })} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2" /></label>
                  <label className="text-sm font-bold md:col-span-2">Description<textarea value={definitionForm.description} onChange={(event) => setDefinitionForm({ ...definitionForm, description: event.target.value })} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2" /></label>
                  <label className="text-sm font-bold">Input type<select value={definitionForm.inputType} onChange={(event) => setDefinitionForm({ ...definitionForm, inputType: event.target.value as StatisticInputType })} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2">{statisticInputTypes.map((type) => <option key={type} value={type}>{inputLabels[type]}</option>)}</select></label>
                  <fieldset className="rounded-lg border border-[#E8DCC8] p-3"><legend className="px-1 text-sm font-bold">Applicable pars</legend><div className="flex gap-4">{[3, 4, 5].map((par) => <label key={par} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={definitionForm.pars.includes(par)} onChange={() => setDefinitionForm({ ...definitionForm, pars: definitionForm.pars.includes(par) ? definitionForm.pars.filter((value) => value !== par) : [...definitionForm.pars, par].sort() })} />Par {par}</label>)}</div></fieldset>
                  {definitionForm.inputType === "bounded_number" ? <><label className="text-sm font-bold">Minimum<input type="number" required value={definitionForm.minimum} onChange={(event) => setDefinitionForm({ ...definitionForm, minimum: event.target.value })} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2" /></label><label className="text-sm font-bold">Maximum<input type="number" required value={definitionForm.maximum} onChange={(event) => setDefinitionForm({ ...definitionForm, maximum: event.target.value })} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2" /></label></> : null}
                  {definitionForm.inputType === "option_list" ? <label className="text-sm font-bold md:col-span-2">Options, one per line<textarea required value={definitionForm.options} onChange={(event) => setDefinitionForm({ ...definitionForm, options: event.target.value })} className="mt-2 min-h-28 w-full rounded-lg border border-[#D9D0C0] px-3 py-2" /></label> : null}
                </div>
                <div className="mt-5 flex gap-2"><button disabled={isSaving} className="rounded-lg bg-[#0B3D2E] px-5 py-3 font-black text-white disabled:opacity-60">{isSaving ? "Saving..." : definitionForm.definitionId ? "Create Version" : "Create Statistic"}</button><button type="button" onClick={() => setDefinitionForm(null)} className="rounded-lg border border-[#0B3D2E] px-5 py-3 font-black">Cancel</button></div>
              </form>
            ) : null}

            <div className="mt-5 grid gap-3">
              {readModel.definitions.map((entry) => (
                <article key={entry.definition.id} className="rounded-lg border border-[#E8DCC8] bg-white p-5">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-black">{entry.latestVersion.name}</h3><span className={`rounded-full px-2 py-1 text-xs font-black ${statusBadge(entry.definition.isActive)}`}>{entry.definition.isActive ? "Active" : "Archived"}</span>{entry.definition.isBuiltIn ? <span className="rounded-full bg-[#F0C96A]/35 px-2 py-1 text-xs font-black">Built-in</span> : null}</div>
                      <p className="mt-1 text-sm text-[#51635C]">{inputLabels[entry.latestVersion.inputType]} · Version {entry.latestVersion.version} · Key: {entry.definition.key}</p>
                      {entry.latestVersion.description ? <p className="mt-2 text-sm text-[#51635C]">{entry.latestVersion.description}</p> : null}
                    </div>
                    {!entry.definition.isBuiltIn ? <div className="flex gap-2"><button type="button" onClick={() => beginDefinitionRevision(entry.definition.id)} className="rounded-lg border border-[#0B3D2E] px-3 py-2 text-sm font-black">New Version</button><button type="button" disabled={isSaving} onClick={() => void toggleDefinitionArchive(entry.definition.id, entry.definition.isActive)} className="rounded-lg border border-[#8A2E2E] px-3 py-2 text-sm font-black text-[#8A2E2E] disabled:opacity-60">{entry.definition.isActive ? "Archive" : "Restore"}</button></div> : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {!isLoading && section === "packages" ? (
          <section className="mt-6">
            <div className="flex items-center justify-between gap-4"><div><h2 className="text-2xl font-black">Statistic Packages</h2><p className="mt-1 text-sm text-[#51635C]">Composition changes create a new immutable package version.</p></div><button type="button" onClick={() => setPackageForm(emptyPackageForm())} className="rounded-lg bg-[#0B3D2E] px-4 py-3 font-black text-white">Create Package</button></div>
            {packageForm ? (
              <form onSubmit={savePackage} className="mt-5 rounded-lg border border-[#B8892D] bg-white p-5">
                <h3 className="text-xl font-black">{packageForm.packageId ? "Create New Package Version" : "New Statistic Package"}</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-sm font-bold">Name<input required value={packageForm.name} onChange={(event) => setPackageForm({ ...packageForm, name: event.target.value })} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2" /></label><label className="text-sm font-bold">Description<input value={packageForm.description} onChange={(event) => setPackageForm({ ...packageForm, description: event.target.value })} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2" /></label></div>
                <div className="mt-5 grid gap-2">
                  {readModel.definitions.map((entry) => {
                    const index = packageForm.items.findIndex((item) => item.definitionId === entry.definition.id);
                    const selected = index >= 0;
                    return <div key={entry.definition.id} className="flex flex-col justify-between gap-3 rounded-lg border border-[#E8DCC8] p-3 sm:flex-row sm:items-center"><label className="flex items-center gap-3 font-bold"><input type="checkbox" checked={selected} onChange={() => togglePackageItem(entry.definition.id)} />{entry.latestVersion.name}{!entry.definition.isActive ? <span className="text-xs text-[#8A2E2E]">(archived)</span> : null}</label>{selected ? <div className="flex items-center gap-2"><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={packageForm.items[index].isRequired} onChange={() => setPackageForm({ ...packageForm, items: packageForm.items.map((item, itemIndex) => itemIndex === index ? { ...item, isRequired: !item.isRequired } : item) })} />Required</label><button type="button" aria-label={`Move ${entry.latestVersion.name} up`} disabled={index === 0} onClick={() => movePackageItem(index, -1)} className="rounded border px-2 py-1 disabled:opacity-30">↑</button><button type="button" aria-label={`Move ${entry.latestVersion.name} down`} disabled={index === packageForm.items.length - 1} onClick={() => movePackageItem(index, 1)} className="rounded border px-2 py-1 disabled:opacity-30">↓</button></div> : null}</div>;
                  })}
                </div>
                <div className="mt-5 flex gap-2"><button disabled={isSaving} className="rounded-lg bg-[#0B3D2E] px-5 py-3 font-black text-white disabled:opacity-60">{isSaving ? "Saving..." : packageForm.packageId ? "Create Package Version" : "Create Package"}</button><button type="button" onClick={() => setPackageForm(null)} className="rounded-lg border border-[#0B3D2E] px-5 py-3 font-black">Cancel</button></div>
              </form>
            ) : null}
            <div className="mt-5 grid gap-3">
              {readModel.packages.length === 0 ? <p className="rounded-lg border border-dashed border-[#D9D0C0] bg-white p-8 text-center font-semibold text-[#51635C]">No statistic packages yet.</p> : readModel.packages.map((entry) => <article key={entry.package.id} className="rounded-lg border border-[#E8DCC8] bg-white p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><h3 className="text-lg font-black">{entry.latestVersion.name}</h3><span className={`rounded-full px-2 py-1 text-xs font-black ${statusBadge(entry.package.isActive)}`}>{entry.package.isActive ? "Active" : "Archived"}</span></div><p className="mt-1 text-sm text-[#51635C]">Version {entry.latestVersion.version} · {entry.latestItems.length} statistics · {entry.latestItems.filter((item) => item.isRequired).length} required</p><ol className="mt-3 flex flex-wrap gap-2">{entry.latestItems.map((item) => { const definitionId = versionToDefinition.get(item.definitionVersionId); const name = definitionId ? definitionById.get(definitionId)?.latestVersion.name : "Historical statistic"; return <li key={item.id} className="rounded-full bg-[#F6F1E6] px-3 py-1 text-xs font-bold">{item.displayOrder + 1}. {name}{item.isRequired ? " · Required" : ""}</li>; })}</ol></div><div className="flex gap-2"><button type="button" onClick={() => beginPackageRevision(entry.package.id)} className="rounded-lg border border-[#0B3D2E] px-3 py-2 text-sm font-black">Edit Package</button><button type="button" disabled={isSaving} onClick={() => void togglePackageArchive(entry.package.id, entry.package.isActive)} className="rounded-lg border border-[#8A2E2E] px-3 py-2 text-sm font-black text-[#8A2E2E] disabled:opacity-60">{entry.package.isActive ? "Archive" : "Restore"}</button></div></div></article>)}
            </div>
          </section>
        ) : null}

        {!isLoading && section === "assignments" ? (
          <section className="mt-6">
            <h2 className="text-2xl font-black">Event Package Assignments</h2>
            <p className="mt-1 text-sm text-[#51635C]">Assignments pin an exact package version and are never rewritten.</p>
            <form onSubmit={saveAssignment} className="mt-5 grid gap-4 rounded-lg border border-[#E8DCC8] bg-white p-5 md:grid-cols-3">
              <label className="text-sm font-bold">Event type<select value={assignmentForm.eventType} onChange={(event) => setAssignmentForm({ ...assignmentForm, eventType: event.target.value as typeof assignmentForm.eventType, eventId: "" })} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2"><option value="tournament">Tournament</option><option value="qualifying">Qualifying</option><option value="practice">Practice</option></select></label>
              {assignmentForm.eventType === "practice" ? <label className="text-sm font-bold">Practice event UUID<input required value={assignmentForm.eventId} onChange={(event) => setAssignmentForm({ ...assignmentForm, eventId: event.target.value })} placeholder="00000000-0000-0000-0000-000000000000" pattern="[0-9a-fA-F-]{36}" className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2" /></label> : <label className="text-sm font-bold">Event<select required value={assignmentForm.eventId} onChange={(event) => setAssignmentForm({ ...assignmentForm, eventId: event.target.value })} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2"><option value="">Select event</option>{targetOptions.map((target) => <option key={target.id} value={target.id}>{target.name} · {target.status}</option>)}</select></label>}
              <label className="text-sm font-bold">Package version<select required value={assignmentForm.packageVersionId} onChange={(event) => setAssignmentForm({ ...assignmentForm, packageVersionId: event.target.value })} className="mt-2 w-full rounded-lg border border-[#D9D0C0] px-3 py-2"><option value="">Select package</option>{readModel.packages.flatMap((entry) => entry.versions.map((version) => <option key={version.id} value={version.id}>{version.name} · v{version.version}{entry.package.isActive ? "" : " · archived"}</option>))}</select></label>
              <button disabled={isSaving} className="rounded-lg bg-[#0B3D2E] px-5 py-3 font-black text-white disabled:opacity-60 md:col-span-3">{isSaving ? "Assigning..." : "Assign Package Version"}</button>
            </form>
            <div className="mt-5 overflow-x-auto rounded-lg border border-[#E8DCC8] bg-white">
              <table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-[#0B3D2E] text-white"><tr><th className="p-3">Event type</th><th className="p-3">Event</th><th className="p-3">Package version</th><th className="p-3">Assigned</th></tr></thead><tbody>{readModel.assignments.length === 0 ? <tr><td colSpan={4} className="p-6 text-center font-semibold text-[#51635C]">No event assignments yet.</td></tr> : readModel.assignments.map((assignment) => { const target = readModel.assignmentTargets.find((candidate) => candidate.eventType === assignment.eventType && candidate.id === assignment.eventId); const packageVersion = readModel.packages.flatMap((entry) => entry.versions).find((version) => version.id === assignment.packageVersionId); return <tr key={assignment.id} className="border-t border-[#E8DCC8]"><td className="p-3 capitalize">{assignment.eventType}</td><td className="p-3 font-bold">{target?.name ?? assignment.eventId}</td><td className="p-3">{packageVersion ? `${packageVersion.name} · v${packageVersion.version}` : assignment.packageVersionId}</td><td className="p-3">{new Date(assignment.assignedAt).toLocaleString()}</td></tr>; })}</tbody></table>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
