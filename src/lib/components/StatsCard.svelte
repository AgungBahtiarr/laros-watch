<script>
  export let label;
  export let value;
  export let color;
</script>

<div class="bg-base-100 rounded-2xl p-6 shadow-xl border border-base-300">
  <div class="flex items-center justify-between">
    <div>
      <p class="text-base-content/60 text-sm font-medium">{label}</p>
      <p class="text-2xl font-bold text-{color}">{value}</p>
    </div>
    <div
      class="w-12 h-12 bg-{color}/20 rounded-full flex items-center justify-center"
    >
      <slot />
    </div>
  </div>
</div>
