# -*- coding: utf-8 -*-


from django.db import migrations, models
import private_storage.fields
import keeper.validators
import keeper.models
import private_storage.storage.files


class Migration(migrations.Migration):

    dependencies = [
        ('keeper', '0001_squashed_0017_auto_20151215_1637'),
    ]

    operations = [
        migrations.AlterField(
            model_name='accession',
            name='first_name',
            field=models.CharField(max_length=100),
        ),
        migrations.AlterField(
            model_name='accession',
            name='last_name',
            field=models.CharField(max_length=100),
        ),
        migrations.AlterField(
            model_name='file',
            name='file',
            field=private_storage.fields.PrivateFileField(storage=private_storage.storage.files.PrivateFileSystemStorage(), upload_to=keeper.models.file_upload_location, validators=[keeper.validators.validate_file_type]),
        ),
    ]
