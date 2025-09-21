<script lang="ts">
	import { createEventDispatcher } from "svelte";
	import type { OdpPoint } from "$lib/types";

	const dispatch = createEventDispatcher();

	export let odpPoint: OdpPoint | null = null;
	export let location = "";

	let name = "";
	let notes = "";

	$: if (odpPoint) {
		name = odpPoint.name;
		notes = odpPoint.notes;
		location = odpPoint.location;
	}

	const handleSave = () => {
		if (name.trim() && odpPoint) {
			dispatch("save", {
				id: odpPoint.id,
				name: name.trim(),
				location: location.trim(),
				notes: notes.trim(),
			});
		}
	};

	const handleDelete = () => {
		if (odpPoint && confirm(`Are you sure you want to delete ODP "${odpPoint.name}"? This action cannot be undone.`)) {
			dispatch("delete", { id: odpPoint.id });
		}
	};
</script>

<div class="modal modal-open">
	<div class="modal-box">
		<h3 class="font-bold text-lg">Edit ODP Point</h3>
		<div class="py-4 space-y-4">
			<div>
				<label for="odp-name" class="label">
					<span class="label-text">ODP Name</span>
				</label>
				<input
					id="odp-name"
					type="text"
					bind:value={name}
					class="input input-bordered w-full"
					placeholder="Enter ODP name"
				/>
			</div>
			<div>
				<label for="odp-location" class="label">
					<span class="label-text">Location</span>
				</label>
				<input
					id="odp-location"
					type="text"
					bind:value={location}
					class="input input-bordered w-full"
					placeholder="e.g. Jalan Telekomunikasi No. 1"
				/>
			</div>
			<div>
				<label for="odp-notes" class="label">
					<span class="label-text">Notes</span>
				</label>
				<textarea
					id="odp-notes"
					bind:value={notes}
					class="textarea textarea-bordered w-full"
					placeholder="Additional notes..."
				></textarea>
			</div>
		</div>
		<div class="modal-action">
			<button class="btn btn-error" on:click={handleDelete}>
				<svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
				</svg>
				Delete
			</button>
			<div class="flex gap-2">
				<button class="btn" on:click={() => dispatch("close")}>Cancel</button>
				<button class="btn btn-primary" on:click={handleSave} disabled={!name.trim()}>Save</button>
			</div>
		</div>
	</div>
</div>