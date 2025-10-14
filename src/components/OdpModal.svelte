<script lang="ts">
    import type { Odp } from "@/types";

    type Props = {
        isOpen: boolean;
        isEdit: boolean;
        odp: Odp | null;
        latlng: { lat: number; lng: number } | null;
        onSave: (odp: any) => void;
        onClose: () => void;
    };

    const { isOpen, isEdit, odp, latlng, onSave, onClose } = $props<Props>();

    let name = $state(odp?.name || "");
    let location = $state(odp?.location || "");
    let notes = $state(odp?.notes || "");
    let lat = $state(odp?.lat || latlng?.lat || null);
    let lng = $state(odp?.lng || latlng?.lng || null);

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
            id: odp?.id,
            name,
            location,
            notes,
            lat: lat?.toString(),
            lng: lng?.toString(),
        };
        onSave(data);
    }

    $effect(() => {
        if (isOpen) {
            if (odp) {
                name = odp.name || "";
                location = odp.location || "";
                notes = odp.notes || "";
                lat = odp.lat;
                lng = odp.lng;
            } else {
                name = "";
                notes = "";
                lat = latlng?.lat || null;
                lng = latlng?.lng || null;
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
        <h3 class="font-bold text-lg">{isEdit ? "Edit" : "Add"} ODP</h3>
        <form onsubmit={handleSubmit}>
            <div class="form-control mt-3">
                <div class="flex flex-col gap-2">
                    <label class="label" for="odpName">Name</label>
                    <input
                        type="text"
                        id="odpName"
                        class="input input-bordered w-full"
                        required
                        bind:value={name}
                    />
                </div>
            </div>
            <div class="form-control mt-2">
                <div class="flex flex-col gap-2">
                    <label class="label" for="odpLocation">Location</label>
                    <input
                        type="text"
                        id="odpLocation"
                        class="input input-bordered w-full"
                        bind:value={location}
                    />
                </div>
            </div>
            <div class="form-control mt-2">
                <div class="flex flex-col gap-2">
                    <label class="label" for="odpNotes">Notes</label>
                    <textarea
                        id="odpNotes"
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
