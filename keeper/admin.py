from django.contrib import admin

from .models import Accession, File


# Override admin site attributes
admin.site.site_title = 'Keeper by UNT Libraries'
admin.site.site_header = 'Keeper administration'


class FileInline(admin.TabularInline):
    model = File
    extra = 0

    readonly_fields = ['file_download_element', 'clickable_thumb']

    fields = ['clickable_thumb', 'file_download_element', 'file_description']


@admin.register(Accession)
class AccessionAdmin(admin.ModelAdmin):

    readonly_fields = ['date_submitted', 'date_last_updated']

    fieldsets = (
        (None, {
            'fields': (('accession_status', 'date_submitted', 'date_last_updated'),)
        }),
        (None, {
            'fields': (('first_name', 'last_name', 'affiliation'),
                       ('email_address', 'phone_number'))
        }),
        (None, {
            'fields': ('description', 'admin_notes')
        }),
    )

    inlines = [FileInline]

    list_display = ('id', 'date_submitted', 'full_name', 'accession_status')

    ordering = ['-id']

    actions = ['update_status_new', 'update_status_review', 'update_status_accepted',
               'update_status_rejected']

    def update_status(self, request, queryset, new_status):
        new_status_desc = [item[1] for item in Accession.STATUS_CHOICES if item[0] == new_status][0]
        rows_updated = queryset.update(accession_status=new_status)
        if rows_updated == 1:
            message_bit = "1 accession was"
        else:
            message_bit = "{} accessions were".format(rows_updated)
        self.message_user(request, "{0} successfully marked as {1}"
                          .format(message_bit, new_status_desc))
    update_status.short_description = "Update Accession Status"

    def update_status_new(self, request, queryset):
        self.update_status(request, queryset, Accession.NEW)
    update_status_new.short_description = "Update status: New"

    def update_status_review(self, request, queryset):
        self.update_status(request, queryset, Accession.REVIEW)
    update_status_review.short_description = "Update status: Under Review"

    def update_status_accepted(self, request, queryset):
        self.update_status(request, queryset, Accession.ACCEPTED)
    update_status_accepted.short_description = "Update status: Accepted"

    def update_status_rejected(self, request, queryset):
        self.update_status(request, queryset, Accession.REJECTED)
    update_status_rejected.short_description = "Update status: Rejected"
