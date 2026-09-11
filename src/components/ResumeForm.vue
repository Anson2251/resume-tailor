<script setup>
import RepeatableList from './RepeatableList.vue'
import { SECTION_FIELD_LABELS, SECTION_FIELDS } from '../data/resume.js'

// The shared master content is edited here; the active profile decides what
// shows, in which order, and can override individual fields.
const master = defineModel({ required: true })
const props = defineProps({
	profile: { type: Object, required: true }
})
const emit = defineEmits(['add', 'remove'])

const add = (key) => emit('add', { key })
const remove = (key, id) => emit('remove', { key, id })

const readOverrides = () => props.profile.overrides || {}

function ensureOverrides() {
	if (!props.profile.overrides) props.profile.overrides = {}
	return props.profile.overrides
}

function setField(item, field, value) {
	const map = ensureOverrides()
	const existing = map[item.id]
	if (value === item[field]) {
		// Back to the master value — drop the override so it follows master again.
		if (!existing) return
		delete existing[field]
		if (!Object.keys(existing).length) delete map[item.id]
		return
	}
	map[item.id] = { ...existing, [field]: value }
}

/**
 * Per-item field accessor for v-model: reads the active profile's override when
 * present (otherwise the master value) and writes copy-on-write overrides.
 */
function fieldModel(item, section) {
	const model = {}
	for (const field of SECTION_FIELDS[section]) {
		Object.defineProperty(model, field, {
			enumerable: true,
			get: () => readOverrides()[item.id]?.[field] ?? item[field],
			set: (value) => setField(item, field, value)
		})
	}
	return model
}

function resetOverrides(id) {
	if (props.profile.overrides) delete props.profile.overrides[id]
}
</script>

<template>
	<div class="space-y-4">
		<!-- Contact information -->
		<section class="card p-5">
			<div class="flex items-baseline justify-between gap-3">
				<h2 class="section-title">Contact Information</h2>
				<span class="shrink-0 text-xs text-slate-400">shared on every profile</span>
			</div>
			<div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div>
					<label class="label" for="f-name">Full name</label>
					<input id="f-name" v-model="master.contact.fullName" class="input" placeholder="Bob Smith" />
				</div>
				<div>
					<label class="label" for="f-email">Email</label>
					<input id="f-email" v-model="master.contact.email" type="email" class="input" placeholder="you@example.com" />
				</div>
				<div>
					<label class="label" for="f-phone">Phone</label>
					<input id="f-phone" v-model="master.contact.phone" type="tel" class="input" placeholder="+33 6 12 34 56 78" />
				</div>
				<div>
					<label class="label" for="f-location">Location</label>
					<input id="f-location" v-model="master.contact.location" class="input" placeholder="City, Country" />
				</div>
				<div>
					<label class="label" for="f-website">Website</label>
					<input id="f-website" v-model="master.contact.website" class="input" placeholder="your-site.dev" />
				</div>
				<div>
					<label class="label" for="f-linkedin">LinkedIn</label>
					<input id="f-linkedin" v-model="master.contact.linkedin" class="input" placeholder="linkedin.com/in/username" />
				</div>
			</div>
		</section>

		<!-- Job title + summary: tailored per profile -->
		<section class="card border-indigo-200 p-5">
			<div class="flex items-baseline justify-between gap-3">
				<h2 class="section-title text-indigo-400">Tailoring</h2>
				<span class="shrink-0 text-xs text-indigo-400">saved on “{{ props.profile.name }}” only</span>
			</div>
			<div class="mt-4 space-y-3">
				<div>
					<label class="label" for="f-title">Job title <span class="font-normal normal-case">(this profile)</span></label>
					<input id="f-title" v-model="profile.title" class="input" placeholder="Frontend Engineer" />
				</div>
				<div>
					<label class="label" for="f-summary">
						Professional summary <span class="font-normal normal-case">(this profile · markdown)</span>
					</label>
					<textarea
						id="f-summary"
						v-model="profile.summary"
						class="textarea"
						rows="5"
						placeholder="**Frontend engineer** with 5 years…&#10;&#10;- Shipped a design system used by 4 teams&#10;- Cut page load by **45%**"
					/>
				</div>
				<p class="text-xs text-slate-400">
					Long-form fields (summary, achievements, highlights, details) render as <strong class="font-semibold">markdown</strong> —
					use <code class="rounded bg-slate-100 px-1">-</code> for bullets, <code class="rounded bg-slate-100 px-1">**bold**</code>,
					<code class="rounded bg-slate-100 px-1">*italic*</code>, <code class="rounded bg-slate-100 px-1">[links](url)</code>.
					Edits are <strong class="font-semibold">saved on this profile only</strong>; other profiles keep the master wording.
				</p>
			</div>
		</section>

		<!-- Experience -->
		<RepeatableList
			title="Experience"
			add-label="Add experience"
			:items="master.experience"
			:can-remove="master.experience.length > 1"
			:overrides="profile.overrides"
			:field-labels="SECTION_FIELD_LABELS.experience"
			v-model:order="profile.view.experience"
			@add="add('experience')"
			@remove="remove('experience', $event)"
			@reset="resetOverrides"
		>
			<template #heading="{ item, index }">
				{{ item.role || item.company ? `${item.role || 'New role'}${item.company ? ` · ${item.company}` : ''}` : `Position ${index + 1}` }}
			</template>
			<template #fields="{ item }">
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<div>
						<label class="label">Role</label>
						<input v-model="fieldModel(item, 'experience').role" class="input" placeholder="Senior Frontend Engineer" />
					</div>
					<div>
						<label class="label">Company</label>
						<input v-model="fieldModel(item, 'experience').company" class="input" placeholder="Acme Corp" />
					</div>
					<div>
						<label class="label">Location</label>
						<input v-model="fieldModel(item, 'experience').location" class="input" placeholder="Remote" />
					</div>
					<div class="grid grid-cols-2 gap-3">
						<div>
							<label class="label">Start</label>
							<input v-model="fieldModel(item, 'experience').startDate" class="input" placeholder="Jan 2022" />
						</div>
						<div>
							<label class="label">End</label>
							<input
								v-model="fieldModel(item, 'experience').endDate"
								class="input"
								placeholder="Dec 2023"
								:disabled="fieldModel(item, 'experience').current"
							/>
						</div>
					</div>
					<div class="sm:col-span-2">
						<label class="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
							<input v-model="fieldModel(item, 'experience').current" type="checkbox" class="h-4 w-4 rounded accent-indigo-600" />
							I currently work here
						</label>
					</div>
					<div class="sm:col-span-2">
						<label class="label">Achievements <span class="font-normal normal-case">(markdown)</span></label>
						<textarea
							v-model="fieldModel(item, 'experience').bullets"
							class="textarea"
							rows="5"
							placeholder="- Shipped X, improving Y by **Z%**&#10;- Led …&#10;- Built …"
						/>
					</div>
				</div>
			</template>
		</RepeatableList>

		<!-- Projects -->
		<RepeatableList
			title="Projects"
			add-label="Add project"
			:items="master.projects"
			:can-remove="master.projects.length > 1"
			:overrides="profile.overrides"
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
						<label class="label">Project name</label>
						<input v-model="fieldModel(item, 'projects').name" class="input" placeholder="Portfolio Site" />
					</div>
					<div>
						<label class="label">Link</label>
						<input v-model="fieldModel(item, 'projects').link" class="input" placeholder="github.com/you/project" />
					</div>
					<div>
						<label class="label">Technologies</label>
						<input v-model="fieldModel(item, 'projects').tech" class="input" placeholder="Vue 3, Tailwind CSS" />
					</div>
					<div class="grid grid-cols-2 gap-3">
						<div>
							<label class="label">Start</label>
							<input v-model="fieldModel(item, 'projects').startDate" class="input" placeholder="2023" />
						</div>
						<div>
							<label class="label">End</label>
							<input v-model="fieldModel(item, 'projects').endDate" class="input" placeholder="2024" />
						</div>
					</div>
					<div class="sm:col-span-2">
						<label class="label">Highlights <span class="font-normal normal-case">(markdown)</span></label>
						<textarea
							v-model="fieldModel(item, 'projects').bullets"
							class="textarea"
							rows="4"
							placeholder="- What it does, your role, outcome…&#10;- [Repo](https://github.com/you/project)"
						/>
					</div>
				</div>
			</template>
		</RepeatableList>

		<!-- Education -->
		<RepeatableList
			title="Education"
			add-label="Add education"
			:items="master.education"
			:can-remove="master.education.length > 1"
			:overrides="profile.overrides"
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
						<label class="label">School</label>
						<input v-model="fieldModel(item, 'education').school" class="input" placeholder="State University" />
					</div>
					<div>
						<label class="label">Degree</label>
						<input v-model="fieldModel(item, 'education').degree" class="input" placeholder="B.S." />
					</div>
					<div>
						<label class="label">Field of study</label>
						<input v-model="fieldModel(item, 'education').field" class="input" placeholder="Computer Science" />
					</div>
					<div>
						<label class="label">GPA <span class="font-normal normal-case">(optional)</span></label>
						<input v-model="fieldModel(item, 'education').gpa" class="input" placeholder="3.8" />
					</div>
					<div>
						<label class="label">Start year</label>
						<input v-model="fieldModel(item, 'education').startDate" class="input" placeholder="2016" />
					</div>
					<div>
						<label class="label">End year</label>
						<input v-model="fieldModel(item, 'education').endDate" class="input" placeholder="2020" />
					</div>
					<div class="sm:col-span-2">
						<label class="label">Details <span class="font-normal normal-case">(markdown, optional)</span></label>
						<textarea
							v-model="fieldModel(item, 'education').details"
							class="textarea"
							rows="3"
							placeholder="Honors, coursework… or a [link](https://…)"
						/>
					</div>
				</div>
			</template>
		</RepeatableList>

		<!-- Skills -->
		<RepeatableList
			title="Skills"
			add-label="Add skill group"
			:items="master.skills"
			:can-remove="master.skills.length > 1"
			:overrides="profile.overrides"
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
						<label class="label">Category</label>
						<input v-model="fieldModel(item, 'skills').category" class="input" placeholder="Languages" />
					</div>
					<div class="sm:col-span-2">
						<label class="label">Skills · comma separated</label>
						<input v-model="fieldModel(item, 'skills').items" class="input" placeholder="JavaScript, TypeScript, HTML, CSS" />
					</div>
				</div>
			</template>
		</RepeatableList>
	</div>
</template>
