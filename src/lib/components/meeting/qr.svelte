<!--
	Adapted from @svelte-put/qr.
	Copyright (c) 2023-2024 Quang Phan.
	Licensed under the MIT License. See THIRD-PARTY-NOTICES.md.
-->
<script lang="ts">
	import { createQrSvgParts, type QRConfig } from '@svelte-put/qr';
	import type { SVGAttributes } from 'svelte/elements';

	let {
		data,
		anchorInnerFill,
		anchorOuterFill,
		logo,
		logoRatio,
		margin,
		moduleFill,
		shape,
		correction,
		version,
		...rest
	}: Omit<SVGAttributes<SVGElement>, 'viewBox' | 'version'> &
		Omit<QRConfig, 'errorCorrectionLevel' | 'typeNumber'> = $props();

	const parts = $derived(
		createQrSvgParts({
			data,
			anchorInnerFill,
			anchorOuterFill,
			logo,
			logoRatio,
			margin,
			moduleFill,
			shape,
			version,
			correction
		})
	);

	const innerHTML = $derived(`${parts.anchors}${parts.modules}${parts.logo}`);
</script>

<svg {...parts.attributes} {...rest}>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html innerHTML}
</svg>
