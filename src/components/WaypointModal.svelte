<script lang="ts">
    import type { Waypoint } from "@/types";

    type Props = {
        isOpen: boolean;
        isEdit: boolean;
        waypoint: Waypoint | null;
        latlng: { lat: number; lng: number } | null;
        onSave: (waypoint: any) => void;
        onClose: () => void;
    };

    const { isOpen, isEdit, waypoint, latlng, onSave, onClose } = $props<Props>();

    let name = $state(waypoint?.name || "");
    let location = $state(waypoint?.location || "");
    let notes = $state(waypoint?.notes || "");
    let lat = $state(waypoint?.lat || latlng?.lat || null);
    let lng = $state(waypoint?.lng || latlng?.lng || null);
    let type = $state(waypoint?.type || "odp");
    let spare = $state(waypoint?.spare || 0);

    async function reverseGeocode(lat: number, lng: number) {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
            );
            if (!response.ok) {
                throw new Error("Reverse geocoding failed");
            }
            const data = await response.json();
            return data.display_name;
        } catch (error) {
            console.error("Reverse geocoding error:", error);
            return "";
        }
    }

    function handleSubmit(event) {
        event.preventDefault();
        const data = {
            id: waypoint?.id,
            name,
            location,
            notes,
            lat: lat?.toString(),
            lng: lng?.toString(),
            type,
            spare,
        };
        onSave(data);
    }

    $effect(() => {
        if (isOpen) {
            if (waypoint) {
                name = waypoint.name || "";
                location = waypoint.location || "";
                notes = waypoint.notes || "";
                lat = waypoint.lat;
                lng = waypoint.lng;
                type = waypoint.type || "odp";
                spare = waypoint.spare || 0;
            } else {
                name = "";
                notes = "";
                lat = latlng?.lat || null;
                lng = latlng?.lng || null;
                type = "odp";
                spare = 0;
                if (lat && lng) {
                    reverseGeocode(lat, lng).then((loc) => (location = loc));
                } else {
                    location = "";
                }
            }
        }
    });

    let dialog: HTMLDialogElement;

    $effect(() => {
        if (dialog) {
            if (isOpen) {
                dialog.showModal();
            } else {
                dialog.close();
            }
        }
    });
</script>

<dialog
    bind:this={dialog}
    onclose={onClose}
    class="modal modal-bottom sm:modal-middle"
>
    <div class="modal-box w-full max-w-lg">
        <h3 class="font-bold text-lg">{isEdit ? "Edit" : "Add"} Waypoint</h3>
        <form onsubmit={handleSubmit}>
            <div class="form-control mt-3">
                <div class="flex flex-col gap-2">
                    <label class="label" for="waypointName">Name</label>
                    <input
                        type="text"
                        id="waypointName"
                        class="input input-bordered w-full"
                        required
                        bind:value={name}
                    />
                </div>
            </div>
            <div class="form-control mt-2">
                <div class="flex flex-col gap-2">
                    <label class="label" for="waypointType">Type</label>
                    <select id="waypointType" class="select select-bordered w-full" bind:value={type}>
                        <option value="odp">ODP</option>
                        <option value="join">Join</option>
                    </select>
                </div>
            </div>
            <div class="form-control mt-2">
                <div class="flex flex-col gap-2">
                    <label class="label" for="waypointLocation">Location</label>
                    <input
                        type="text"
                        id="waypointLocation"
                        class="input input-bordered w-full"
                        bind:value={location}
                    />
                </div>
            </div>
            <div class="form-control mt-2">
                <div class="flex flex-col gap-2">
                    <label class="label" for="waypointSpare">Spare Cable (m)</label>
                    <input
                        type="number"
                        id="waypointSpare"
                        class="input input-bordered w-full"
                        bind:value={spare}
                    />
                </div>
            </div>
            <div class="form-control mt-2">
                <div class="flex flex-col gap-2">
                    <label class="label" for="waypointNotes">Notes</label>
                    <textarea
                        id="waypointNotes"
                        class="textarea textarea-bordered w-full"
                        bind:value={notes}
                    ></textarea>
                </div>
            </div>
            <div class="modal-action">
                <button type="button" class="btn" onclick={onClose}
                    >Cancel</button
                >
                <button type="submit" class="btn btn-primary">Save</button>
            </div>
        </form>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button>close</button>
    </form>
</dialog>
