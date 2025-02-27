<template>
  <div>
    <h1>News {{ id }}</h1>
  </div>
</template>

<script setup>
const route = useRoute()
const id = route.params.id
</script>
