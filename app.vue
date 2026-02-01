<script setup lang="ts">
useHead({
  script: [{
    innerHTML: `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)spec-cat-theme=([^;]*)/);var t=m?m[1]:'dark';if(t==='light'){document.documentElement.classList.remove('dark')}else{document.documentElement.classList.add('dark')}}catch(e){document.documentElement.classList.add('dark')}})()`,
    type: 'text/javascript',
    tagPosition: 'head',
  }],
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
