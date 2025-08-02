<script lang="ts">
  import "../app.css";
  import "leaflet/dist/leaflet.css";
  import Navbar from "$lib/components/Navbar.svelte";

  let { children } = $props();
</script>

<div
  class="min-h-screen bg-gradient-to-br from-base-300 via-base-200 to-base-100"
>
  <div class="container mx-auto px-4 py-8">
    <Navbar />
    <main>
      {@render children()}
    </main>
  </div>
</div>
