<!-- IMPORT partials/breadcrumbs.tpl -->
<div data-widget-area="header">
	{{{each widgets.header}}}
	{{widgets.header.html}}
	{{{end}}}
</div>
<div class="row">
	<div class="col-12" data-widget-area="content">
		{{{each widgets.content}}}
		{{widgets.content.html}}
		{{{end}}}
	</div>
</div>
