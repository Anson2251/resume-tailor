<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { FwbCheckbox, FwbInput, FwbTextarea } from 'flowbite-vue'
import RepeatableList from './RepeatableList.vue'
import {
	CUSTOM_FIELD_LABELS,
	CUSTOM_ITEM_FIELDS,
	DEFAULT_SECTION_ORDER,
	SECTION_FIELD_LABELS,
	SECTION_FIELDS,
	customSectionTitle,
	isSectionKey,
	readField,
	writeField,
} from '../data/resume'
import type { ContentItem, CustomItem, CustomSection, MasterResume, OverridePatch, Profile } from '../data/types'

// The shared master content is edited here; the active profile decides what
// shows, in which order, and can override individual fields.
const master = defineModel<MasterResume>({ required: true })
const props = defineProps<{
	profile: Profile
	/** True when the active profile is the master: item edits change the shared
	 * content directly instead of creating per-profile overrides. */
	editMaster?: boolean
}>()
const emit = defineEmits<{
	add: [payload: { key: string }]
	remove: [payload: { key: string; id: string }]
}>()

const add = (key: string): void => emit('add', { key })
const remove = (key: string, id: string): void => emit('remove', { key, id })

// The form mirrors the resume: Tailoring (summary) + repeatable sections render
// in the profile's section order. Contact stays pinned at the top — it is shared
// on every profile, not a resume body section. Hidden sections stay editable here.
const sectionOrder = computed<string[]>(() => {
	const known = new Set<string>(['summary', 'experience', 'projects', 'education', 'skills'])
	for (const s of master.value.customSections || []) known.add(s.id)
	const ids = (props.profile.sections || []).map((s) => s.id).filter((id) => known.has(id))
	for (const id of DEFAULT_SECTION_ORDER) if (!ids.includes(id)) ids.push(id)
	for (const s of master.value.customSections || []) if (!ids.includes(s.id)) ids.push(s.id)
	return ids
})

const customSection = (sid: string): CustomSection | undefined =>
	(master.value.customSections || []).find((s) => s.id === sid)
const customItems = (sid: string): CustomItem[] => customSection(sid)?.items || []

function customTitle(sid: string): string {
	const entry = props.profile.sections?.find((s) => s.id === sid)
	return customSectionTitle(customSection(sid), entry)
}

// Every custom section needs a view entry on this profile (holds shown ids).
// normalizeWorkspace guarantees this on load; this covers sections created
// at runtime before any other write touches the profile.
watchEffect(() => {
	const custom = (props.profile.view.custom ??= {})
	for (const s of master.value.customSections || []) custom[s.id] ??= (s.items || []).map((item) => item.id)
})

// The master profile has no overrides.
const overrides = computed(() => (props.editMaster ? {} : props.profile.overrides))

const readOverrides = (): Record<string, OverridePatch> => props.profile.overrides || {}

function ensureOverrides(): Record<string, OverridePatch> {
	if (!props.profile.overrides) props.profile.overrides = {}
	return props.profile.overrides
}

function setField(item: ContentItem, field: string, value: string | boolean): void {
	const map = ensureOverrides()
	const existing = map[item.id]
	if (value === readField(item, field)) {
		// Back to the master value — drop the override so it follows master again.
		if (!existing) return
		delete existing[field]
		if (!Object.keys(existing).length) delete map[item.id]
		return
	}
	map[item.id] = { ...existing, [field]: value }
}

/**
 * Per-item field accessor for v-model. On the master profile it reads and writes
 * the shared content directly; on other profiles it reads the overlay when one is
 * present (otherwise the master value) and writes copy-on-write overrides.
 * User-created sections use the generic heading/sub/dates/body fields.
 */
// `Record<string, any>` keeps template v-models untyped (text inputs, checkboxes).
function fieldModel(item: ContentItem, section: string): Record<string, any> {
	const fields = isSectionKey(section) ? SECTION_FIELDS[section] : CUSTOM_ITEM_FIELDS
	const model: Record<string, any> = {}
	for (const field of fields) {
		Object.defineProperty(model, field, {
			enumerable: true,
			get: () =>
				props.editMaster ? readField(item, field) : (readOverrides()[item.id]?.[field] ?? readField(item, field)),
			set: (value: string | boolean) => {
				if (props.editMaster) writeField(item, field, value)
				else setField(item, field, value)
			},
		})
	}
	return model
}

function resetOverrides(id: string): void {
	if (props.editMaster) return
	if (props.profile.overrides) delete props.profile.overrides[id]
}
</script>

<template>
	<div class="space-y-4">
		<!-- Contact information (always on top: shared on every profile) -->
		<section
			id="form-section-contact"
			class="scroll-mt-[150px] rounded-xl border border-default bg-neutral-primary-medium p-5 shadow-sm"
		>
			<div class="flex items-baseline justify-between gap-3">
				<h2 class="text-sm font-bold tracking-widest text-body-subtle uppercase">Contact Information</h2>
				<span class="shrink-0 text-xs text-body-subtle">shared on every profile</span>
			</div>
			<div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div>
					<FwbInput v-model="master.contact.fullName" label="Full name" placeholder="Bob Smith" />
				</div>
				<div>
					<FwbInput v-model="master.contact.email" label="Email" placeholder="you@example.com" type="email" />
				</div>
				<div>
					<FwbInput v-model="master.contact.phone" label="Phone" placeholder="+33 6 12 34 56 78" type="tel" />
				</div>
				<div>
					<FwbInput v-model="master.contact.location" label="Location" placeholder="City, Country" />
				</div>
				<div>
					<FwbInput v-model="master.contact.website" label="Website" placeholder="your-site.dev" />
				</div>
				<div>
					<FwbInput v-model="master.contact.linkedin" label="LinkedIn" placeholder="linkedin.com/in/username" />
				</div>
			</div>
		</section>

		<!-- Everything below follows the profile's section order (Sections panel). -->
		<template v-for="sid in sectionOrder" :key="sid">
			<!-- Job title + summary: tailored per profile -->
			<section
				v-if="sid === 'summary'"
				id="form-section-summary"
				class="scroll-mt-[150px] rounded-xl border border-brand-subtle bg-neutral-primary-medium p-5 shadow-sm"
			>
				<div class="flex items-baseline justify-between gap-3">
					<h2 class="text-sm font-bold tracking-widest text-fg-brand uppercase">Tailoring</h2>
					<span class="shrink-0 text-xs text-fg-brand">
						{{ editMaster ? 'master · items edit shared content' : `saved on “${props.profile.name}” only` }}
					</span>
				</div>
				<div class="mt-4 space-y-3">
					<template v-if="editMaster">
						<p class="text-[13px] text-body-subtle">
							Master holds the shared content — it has no tailored headline or summary. Those live on each job profile,
							where the agent tailors them from this content.
						</p>
					</template>
					<template v-else>
						<div>
							<FwbInput v-model="profile.title" label="Job title (this profile)" placeholder="Frontend Engineer" />
						</div>
						<div>
							<FwbTextarea
								v-model="profile.summary"
								label="Professional summary (this profile · markdown)"
								placeholder="**Frontend engineer** with 5 years…&#10;&#10;- Shipped a design system used by 4 teams&#10;- Cut page load by **45%**"
								:rows="5"
							/>
						</div>
					</template>
					<p class="text-xs text-body-subtle">
						Long-form fields (summary, achievements, highlights, details) render as
						<strong class="font-semibold">markdown</strong> — use
						<code class="rounded bg-neutral-tertiary px-1">-</code> for bullets,
						<code class="rounded bg-neutral-tertiary px-1">**bold**</code>,
						<code class="rounded bg-neutral-tertiary px-1">*italic*</code>,
						<code class="rounded bg-neutral-tertiary px-1">[links](url)</code>.
						<template v-if="editMaster">
							This is the <strong class="font-semibold">master</strong> profile: item content edits change the shared
							content that every profile inherits.
						</template>
						<template v-else>
							Edits are <strong class="font-semibold">saved on this profile only</strong>; other profiles keep the
							master wording.
						</template>
					</p>
				</div>
			</section>

			<!-- Experience -->
			<RepeatableList
				v-else-if="sid === 'experience'"
				section-id="form-section-experience"
				title="Experience"
				add-label="Add experience"
				:items="master.experience"
				:can-remove="master.experience.length > 1"
				:overrides="overrides"
				:field-labels="SECTION_FIELD_LABELS.experience"
				v-model:order="profile.view.experience"
				@add="add('experience')"
				@remove="remove('experience', $event)"
				@reset="resetOverrides"
			>
				<template #heading="{ item, index }">
					{{
						item.role || item.company
							? `${item.role || 'New role'}${item.company ? ` · ${item.company}` : ''}`
							: `Position ${index + 1}`
					}}
				</template>
				<template #fields="{ item }">
					<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div>
							<FwbInput
								v-model="fieldModel(item, 'experience').role"
								label="Role"
								placeholder="Senior Frontend Engineer"
							/>
						</div>
						<div>
							<FwbInput v-model="fieldModel(item, 'experience').company" label="Company" placeholder="Acme Corp" />
						</div>
						<div>
							<FwbInput v-model="fieldModel(item, 'experience').location" label="Location" placeholder="Remote" />
						</div>
						<div class="grid grid-cols-2 gap-3">
							<div>
								<FwbInput v-model="fieldModel(item, 'experience').startDate" label="Start" placeholder="Jan 2022" />
							</div>
							<div>
								<FwbInput
									v-model="fieldModel(item, 'experience').endDate"
									label="End"
									placeholder="Dec 2023"
									:disabled="fieldModel(item, 'experience').current"
								/>
							</div>
						</div>
						<div class="sm:col-span-2">
							<FwbCheckbox v-model="fieldModel(item, 'experience').current" label="I currently work here" />
						</div>
						<div class="sm:col-span-2">
							<FwbTextarea
								v-model="fieldModel(item, 'experience').bullets"
								label="Achievements (markdown)"
								placeholder="- Shipped X, improving Y by **Z%**&#10;- Led …&#10;- Built …"
								:rows="5"
							/>
						</div>
					</div>
				</template>
			</RepeatableList>

			<!-- Projects -->
			<RepeatableList
				v-else-if="sid === 'projects'"
				section-id="form-section-projects"
				title="Projects"
				add-label="Add project"
				:items="master.projects"
				:can-remove="master.projects.length > 1"
				:overrides="overrides"
				:field-labels="SECTION_FIELD_LABELS.projects"
				v-model:order="profile.view.projects"
				@add="add('projects')"
				@remove="remove('projects', $event)"
				@reset="resetOverrides"
			>
				<template #heading="{ item, index }">{{ item.name || `Project ${index + 1}` }}</template>
				<template #fields="{ item }">
					<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div>
							<FwbInput v-model="fieldModel(item, 'projects').name" label="Project name" placeholder="Portfolio Site" />
						</div>
						<div>
							<FwbInput v-model="fieldModel(item, 'projects').link" label="Link" placeholder="github.com/you/project" />
						</div>
						<div>
							<FwbInput
								v-model="fieldModel(item, 'projects').tech"
								label="Technologies"
								placeholder="Vue 3, Tailwind CSS"
							/>
						</div>
						<div class="grid grid-cols-2 gap-3">
							<div>
								<FwbInput v-model="fieldModel(item, 'projects').startDate" label="Start" placeholder="2023" />
							</div>
							<div>
								<FwbInput v-model="fieldModel(item, 'projects').endDate" label="End" placeholder="2024" />
							</div>
						</div>
						<div class="sm:col-span-2">
							<FwbTextarea
								v-model="fieldModel(item, 'projects').bullets"
								label="Highlights (markdown)"
								placeholder="- What it does, your role, outcome…&#10;- [Repo](https://github.com/you/project)"
								:rows="4"
							/>
						</div>
					</div>
				</template>
			</RepeatableList>

			<!-- Education -->
			<RepeatableList
				v-else-if="sid === 'education'"
				section-id="form-section-education"
				title="Education"
				add-label="Add education"
				:items="master.education"
				:can-remove="master.education.length > 1"
				:overrides="overrides"
				:field-labels="SECTION_FIELD_LABELS.education"
				v-model:order="profile.view.education"
				@add="add('education')"
				@remove="remove('education', $event)"
				@reset="resetOverrides"
			>
				<template #heading="{ item, index }">
					{{ item.school || `School ${index + 1}` }}{{ item.degree ? ` · ${item.degree}` : '' }}
				</template>
				<template #fields="{ item }">
					<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div>
							<FwbInput v-model="fieldModel(item, 'education').school" label="School" placeholder="State University" />
						</div>
						<div>
							<FwbInput v-model="fieldModel(item, 'education').degree" label="Degree" placeholder="B.S." />
						</div>
						<div>
							<FwbInput
								v-model="fieldModel(item, 'education').field"
								label="Field of study"
								placeholder="Computer Science"
							/>
						</div>
						<div>
							<FwbInput v-model="fieldModel(item, 'education').gpa" label="GPA (optional)" placeholder="3.8" />
						</div>
						<div>
							<FwbInput v-model="fieldModel(item, 'education').startDate" label="Start year" placeholder="2016" />
						</div>
						<div>
							<FwbInput v-model="fieldModel(item, 'education').endDate" label="End year" placeholder="2020" />
						</div>
						<div class="sm:col-span-2">
							<FwbTextarea
								v-model="fieldModel(item, 'education').details"
								label="Details (markdown, optional)"
								placeholder="Honors, coursework… or a [link](https://…)"
								:rows="3"
							/>
						</div>
					</div>
				</template>
			</RepeatableList>

			<!-- Skills -->
			<RepeatableList
				v-else-if="sid === 'skills'"
				section-id="form-section-skills"
				title="Skills"
				add-label="Add skill group"
				:items="master.skills"
				:can-remove="master.skills.length > 1"
				:overrides="overrides"
				:field-labels="SECTION_FIELD_LABELS.skills"
				v-model:order="profile.view.skills"
				@add="add('skills')"
				@remove="remove('skills', $event)"
				@reset="resetOverrides"
			>
				<template #heading="{ item, index }">{{ item.category || `Skill group ${index + 1}` }}</template>
				<template #fields="{ item }">
					<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
						<div class="sm:col-span-1">
							<FwbInput v-model="fieldModel(item, 'skills').category" label="Category" placeholder="Languages" />
						</div>
						<div class="sm:col-span-2">
							<FwbInput
								v-model="fieldModel(item, 'skills').items"
								label="Skills · comma separated"
								placeholder="JavaScript, TypeScript, HTML, CSS"
							/>
						</div>
					</div>
				</template>
			</RepeatableList>

			<!-- User-created section -->
			<RepeatableList
				v-else
				:section-id="`form-section-${sid}`"
				:title="customTitle(sid)"
				add-label="Add item"
				:items="customItems(sid)"
				:can-remove="customItems(sid).length > 1"
				:overrides="overrides"
				:field-labels="CUSTOM_FIELD_LABELS"
				v-model:order="profile.view.custom[sid]"
				@add="add(sid)"
				@remove="remove(sid, $event)"
				@reset="resetOverrides"
			>
				<template #heading="{ item, index }">{{ item.heading || `Item ${index + 1}` }}</template>
				<template #fields="{ item }">
					<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div>
							<FwbInput
								v-model="fieldModel(item, sid).heading"
								label="Heading"
								placeholder="AWS Certified Solutions Architect"
							/>
						</div>
						<div>
							<FwbInput v-model="fieldModel(item, sid).dates" label="Dates" placeholder="2024" />
						</div>
						<div class="sm:col-span-2">
							<FwbInput v-model="fieldModel(item, sid).sub" label="Subtitle" placeholder="Amazon Web Services" />
						</div>
						<div class="sm:col-span-2">
							<FwbTextarea
								v-model="fieldModel(item, sid).body"
								label="Details (markdown, optional)"
								placeholder="- Credential ID …&#10;- [Verify](https://…)"
								:rows="3"
							/>
						</div>
					</div>
				</template>
			</RepeatableList>
		</template>
	</div>
</template>
