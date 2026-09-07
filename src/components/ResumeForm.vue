<script setup>
import { blankEducation, blankExperience, blankSkillGroup } from '../data/resume.js'

const resume = defineModel({ required: true })

function move(list, index, delta) {
	const target = index + delta
	if (target < 0 || target >= list.length) return
	const [item] = list.splice(index, 1)
	list.splice(target, 0, item)
}

function addExperience() {
	resume.value.experience.push(blankExperience())
}

function addEducation() {
	resume.value.education.push(blankEducation())
}

function addSkillGroup() {
	resume.value.skills.push(blankSkillGroup())
}
</script>

<template>
	<div class="space-y-4">
		<!-- Contact information -->
		<section class="card p-5">
			<h2 class="section-title">Contact Information</h2>
			<div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div>
					<label class="label" for="f-name">Full name</label>
					<input id="f-name" v-model="resume.contact.fullName" class="input" placeholder="Alex Morgan" />
				</div>
				<div>
					<label class="label" for="f-title">Job title</label>
					<input id="f-title" v-model="resume.contact.title" class="input" placeholder="Frontend Engineer" />
				</div>
				<div>
					<label class="label" for="f-email">Email</label>
					<input id="f-email" v-model="resume.contact.email" type="email" class="input" placeholder="you@example.com" />
				</div>
				<div>
					<label class="label" for="f-phone">Phone</label>
					<input id="f-phone" v-model="resume.contact.phone" type="tel" class="input" placeholder="+1 (555) 000-0000" />
				</div>
				<div>
					<label class="label" for="f-location">Location</label>
					<input id="f-location" v-model="resume.contact.location" class="input" placeholder="City, State" />
				</div>
				<div>
					<label class="label" for="f-website">Website</label>
					<input id="f-website" v-model="resume.contact.website" class="input" placeholder="your-site.dev" />
				</div>
				<div class="sm:col-span-2">
					<label class="label" for="f-linkedin">LinkedIn</label>
					<input id="f-linkedin" v-model="resume.contact.linkedin" class="input" placeholder="linkedin.com/in/username" />
				</div>
				<div class="sm:col-span-2">
					<label class="label" for="f-summary">Professional summary</label>
					<textarea
						id="f-summary"
						v-model="resume.contact.summary"
						class="textarea"
						rows="4"
						placeholder="2–3 sentences tailoring yourself to the role…"
					/>
				</div>
			</div>
		</section>

		<!-- Experience -->
		<section class="card p-5">
			<div class="flex items-center justify-between">
				<h2 class="section-title">Experience · {{ resume.experience.length }}</h2>
			</div>

			<div class="mt-4 space-y-3">
				<article
					v-for="(job, i) in resume.experience"
					:key="job.id"
					class="rounded-lg border border-slate-200 bg-slate-50/60 p-4"
				>
					<div class="mb-3 flex items-center justify-between gap-2">
						<p class="text-sm font-semibold text-slate-700">
							{{ job.role || job.company ? `${job.role || 'New role'}${job.company ? ` · ${job.company}` : ''}` : `Position ${i + 1}` }}
						</p>
						<div class="flex items-center gap-1">
							<button class="icon-btn" title="Move up" :disabled="i === 0" @click="move(resume.experience, i, -1)">↑</button>
							<button
								class="icon-btn"
								title="Move down"
								:disabled="i === resume.experience.length - 1"
								@click="move(resume.experience, i, 1)"
							>
								↓
							</button>
							<button
								class="icon-btn hover:!bg-red-50 hover:!text-red-600"
								title="Remove"
								:disabled="resume.experience.length === 1"
								@click="resume.experience.splice(i, 1)"
							>
								✕
							</button>
						</div>
					</div>

					<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div>
							<label class="label">Role</label>
							<input v-model="job.role" class="input" placeholder="Senior Frontend Engineer" />
						</div>
						<div>
							<label class="label">Company</label>
							<input v-model="job.company" class="input" placeholder="Acme Corp" />
						</div>
						<div>
							<label class="label">Location</label>
							<input v-model="job.location" class="input" placeholder="Remote" />
						</div>
						<div class="grid grid-cols-2 gap-3">
							<div>
								<label class="label">Start</label>
								<input v-model="job.startDate" class="input" placeholder="Jan 2022" />
							</div>
							<div>
								<label class="label">End</label>
								<input v-model="job.endDate" class="input" placeholder="Dec 2023" :disabled="job.current" />
							</div>
						</div>
						<div class="sm:col-span-2">
							<label class="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
								<input v-model="job.current" type="checkbox" class="h-4 w-4 rounded accent-indigo-600" />
								I currently work here
							</label>
						</div>
						<div class="sm:col-span-2">
							<label class="label">Achievements · one per line</label>
							<textarea
								v-model="job.bullets"
								class="textarea font-mono"
								rows="4"
								placeholder="Shipped X, improving Y by Z%&#10;Led …&#10;Built …"
							/>
						</div>
					</div>
				</article>
			</div>

			<button class="btn btn-secondary mt-4 w-full border-dashed" @click="addExperience">
				<span class="text-lg leading-none">+</span> Add experience
			</button>
		</section>

		<!-- Education -->
		<section class="card p-5">
			<h2 class="section-title">Education · {{ resume.education.length }}</h2>

			<div class="mt-4 space-y-3">
				<article
					v-for="(edu, i) in resume.education"
					:key="edu.id"
					class="rounded-lg border border-slate-200 bg-slate-50/60 p-4"
				>
					<div class="mb-3 flex items-center justify-between gap-2">
						<p class="text-sm font-semibold text-slate-700">
							{{ edu.school || `School ${i + 1}` }}{{ edu.degree ? ` · ${edu.degree}` : '' }}
						</p>
						<div class="flex items-center gap-1">
							<button class="icon-btn" title="Move up" :disabled="i === 0" @click="move(resume.education, i, -1)">↑</button>
							<button
								class="icon-btn"
								title="Move down"
								:disabled="i === resume.education.length - 1"
								@click="move(resume.education, i, 1)"
							>
								↓
							</button>
							<button
								class="icon-btn hover:!bg-red-50 hover:!text-red-600"
								title="Remove"
								:disabled="resume.education.length === 1"
								@click="resume.education.splice(i, 1)"
							>
								✕
							</button>
						</div>
					</div>

					<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div>
							<label class="label">School</label>
							<input v-model="edu.school" class="input" placeholder="State University" />
						</div>
						<div>
							<label class="label">Degree</label>
							<input v-model="edu.degree" class="input" placeholder="B.S." />
						</div>
						<div>
							<label class="label">Field of study</label>
							<input v-model="edu.field" class="input" placeholder="Computer Science" />
						</div>
						<div>
							<label class="label">GPA <span class="font-normal normal-case">(optional)</span></label>
							<input v-model="edu.gpa" class="input" placeholder="3.8" />
						</div>
						<div>
							<label class="label">Start year</label>
							<input v-model="edu.startDate" class="input" placeholder="2016" />
						</div>
						<div>
							<label class="label">End year</label>
							<input v-model="edu.endDate" class="input" placeholder="2020" />
						</div>
						<div class="sm:col-span-2">
							<label class="label">Details <span class="font-normal normal-case">(optional)</span></label>
							<textarea v-model="edu.details" class="textarea" rows="2" placeholder="Honors, coursework, activities…" />
						</div>
					</div>
				</article>
			</div>

			<button class="btn btn-secondary mt-4 w-full border-dashed" @click="addEducation">
				<span class="text-lg leading-none">+</span> Add education
			</button>
		</section>

		<!-- Skills -->
		<section class="card p-5">
			<h2 class="section-title">Skills · {{ resume.skills.length }}</h2>

			<div class="mt-4 space-y-3">
				<article
					v-for="(group, i) in resume.skills"
					:key="group.id"
					class="rounded-lg border border-slate-200 bg-slate-50/60 p-4"
				>
					<div class="mb-3 flex items-center justify-between gap-2">
						<p class="text-sm font-semibold text-slate-700">{{ group.category || `Skill group ${i + 1}` }}</p>
						<div class="flex items-center gap-1">
							<button class="icon-btn" title="Move up" :disabled="i === 0" @click="move(resume.skills, i, -1)">↑</button>
							<button
								class="icon-btn"
								title="Move down"
								:disabled="i === resume.skills.length - 1"
								@click="move(resume.skills, i, 1)"
							>
								↓
							</button>
							<button
								class="icon-btn hover:!bg-red-50 hover:!text-red-600"
								title="Remove"
								:disabled="resume.skills.length === 1"
								@click="resume.skills.splice(i, 1)"
							>
								✕
							</button>
						</div>
					</div>

					<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
						<div class="sm:col-span-1">
							<label class="label">Category</label>
							<input v-model="group.category" class="input" placeholder="Languages" />
						</div>
						<div class="sm:col-span-2">
							<label class="label">Skills · comma separated</label>
							<input v-model="group.items" class="input" placeholder="JavaScript, TypeScript, HTML, CSS" />
						</div>
					</div>
				</article>
			</div>

			<button class="btn btn-secondary mt-4 w-full border-dashed" @click="addSkillGroup">
				<span class="text-lg leading-none">+</span> Add skill group
			</button>
		</section>
	</div>
</template>
