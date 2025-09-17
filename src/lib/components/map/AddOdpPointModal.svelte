<script lang="ts">
	import { createEventDispatcher } from "svelte";

	const dispatch = createEventDispatcher();

	export let location = "";
	let name = "";
	let notes = "";

	const handleSave = () => {
		if (name.trim()) {
			dispatch("save", {
				name: name.trim(),
				location: location.trim(),
				notes: notes.trim(),
			});
		}
	};
</script>

<div class="modal modal-open">
	<div class="modal-box">
		<h3 class="font-bold text-lg">Add ODP Point</h3>
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
			<button class="btn" on:click={() => dispatch("close")}>Cancel</button>
			<button class="btn btn-primary" on:click={handleSave} disabled={!name.trim()}>Save</button>
		</div>
	</div>
</div>